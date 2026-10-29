#!/usr/bin/env node
// GitHub pull request helper for the create-pr skill. No gh needed.
//
//   node github-pr.mjs info
//       Print the open PR for the current branch as JSON ({ number, html_url, base, title, draft })
//       or `null` when there is none. Needs GITHUB_TOKEN; exit 3 when it is missing.
//   node github-pr.mjs create <base-branch> <draft-file> [--draft]
//       Open a PR for the current branch (already pushed), or update the body of the one that is
//       already open. Needs GITHUB_TOKEN (a fine-grained token with Pull requests: Read and write,
//       or a classic token with `repo`); exit 3 when it is missing.
//   node github-pr.mjs new-url <base-branch> <draft-file> [--open]
//       Print an "Open a pull request" link with the title and description filled in. With --open,
//       also open it in the default browser, so nobody has to copy a long URL by hand.
//
// The draft file is what describe-pr writes: the title on the first line, a blank line, the body.
// The token is only ever sent in a request header; it is never printed.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deliverLink, parseDraft, parseRemote } from './gitlab-mr.mjs';

// Browsers and GitHub start refusing URLs well before this; past it, paste the body by hand.
export const MAX_URL_LENGTH = 8000;

/** `owner/repo` path segments keep their `/`, everything else is encoded. */
const refPath = (ref) => ref.split('/').map(encodeURIComponent).join('/');

export const apiBase = (host) => (host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`);

export const newPullRequestUrl = ({ host, path }, { base, head, title, body }) => {
  const params = new URLSearchParams({ quick_pull: '1', title, body });
  return `https://${host}/${path}/compare/${refPath(base)}...${refPath(head)}?${params}`;
};

/** API route listing the open PRs whose head is `branch` in the repo's own owner. */
export const openPullRequestsRoute = (repoPath, branch) => {
  const [owner] = repoPath.split('/');
  const query = new URLSearchParams({ state: 'open', head: `${owner}:${branch}` });
  return `/repos/${repoPath}/pulls?${query}`;
};

/** The fields create-pr needs from a GitHub PR, or null when there is none. */
export const summarizePullRequest = (pr) =>
  pr
    ? { number: pr.number, html_url: pr.html_url, base: pr.base?.ref, title: pr.title, draft: Boolean(pr.draft) }
    : null;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const fail = (message, code = 1) => {
  process.stderr.write(`github-pr: ${message}\n`);
  process.exitCode = code;
};

const api = async (remote, token, method, route, body) => {
  const response = await fetch(`${apiBase(remote.host)}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'factory-kit',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${route} → HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
};

const tokenOrFail = (hint) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) fail(`GITHUB_TOKEN is not set; ${hint}`, 3);
  return token;
};

const openPullRequest = async (remote, token, branch) => {
  const [pr] = await api(remote, token, 'GET', openPullRequestsRoute(remote.path, branch));
  return pr;
};

const info = async (remote) => {
  const token = tokenOrFail('use new-url instead.');
  if (!token) return;
  const pr = await openPullRequest(remote, token, git('rev-parse', '--abbrev-ref', 'HEAD'));
  console.log(JSON.stringify(summarizePullRequest(pr)));
};

const create = async (remote, base, draftFile, draft) => {
  const token = tokenOrFail('use new-url instead.');
  if (!token) return;

  const { title, body } = parseDraft(readFileSync(draftFile, 'utf8'));
  if (!title) return fail(`${draftFile} has no title line.`);
  const head = git('rev-parse', '--abbrev-ref', 'HEAD');

  const existing = await openPullRequest(remote, token, head);
  if (existing) {
    const updated = await api(remote, token, 'PATCH', `/repos/${remote.path}/pulls/${existing.number}`, { body });
    console.log(`Updated the description of #${updated.number}: ${updated.html_url}`);
    return;
  }

  const created = await api(remote, token, 'POST', `/repos/${remote.path}/pulls`, { title, head, base, body, draft });
  console.log(`Opened #${created.number}: ${created.html_url}`);
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  const remote = parseRemote(git('remote', 'get-url', 'origin'));
  if (!remote) return fail('origin is not a URL this helper understands.');

  if (command === 'info') return info(remote);
  if (command === 'create' && args[0] && args[1]) return create(remote, args[0], args[1], args.includes('--draft'));

  if (command === 'new-url' && args[0] && args[1]) {
    const { title, body } = parseDraft(readFileSync(args[1], 'utf8'));
    const head = git('rev-parse', '--abbrev-ref', 'HEAD');
    const open = args.includes('--open');
    const url = newPullRequestUrl(remote, { base: args[0], head, title, body });
    if (url.length > MAX_URL_LENGTH) {
      fail(`the link is ${url.length} characters, too long to open reliably; open it without the body and paste the description.`, 4);
      deliverLink(newPullRequestUrl(remote, { base: args[0], head, title, body: '' }), open, '"Open a pull request" page');
      return;
    }
    deliverLink(url, open, '"Open a pull request" page');
    return;
  }

  fail('usage: github-pr.mjs info | create <base> <draft-file> [--draft] | new-url <base> <draft-file> [--open]', 2);
};

// Ends by returning, never process.exit(): see format-on-edit.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.message));
}
