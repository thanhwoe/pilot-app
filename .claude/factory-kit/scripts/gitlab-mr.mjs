#!/usr/bin/env node
// GitLab merge request helper for the create-pr skill. No glab needed.
//
//   node gitlab-mr.mjs describe <draft-file>
//       Set the description of the open MR for the current branch through the GitLab API.
//       Needs GITLAB_TOKEN (a personal access token with the `api` scope) in the environment.
//       Exit 3 when the token is missing, so the caller can fall back to the link.
//   node gitlab-mr.mjs info
//       Print the open MR for the current branch as JSON ({ iid, web_url, target_branch, title, draft })
//       or `null` when there is none. Same token rules as describe.
//   node gitlab-mr.mjs new-url <target-branch> <draft-file> [--draft] [--open]
//       Print a "New merge request" link with the title and description filled in. With --open,
//       also open it in the default browser, so nobody has to copy a long URL by hand.
//
// The draft file is what describe-pr writes: the title on the first line, a blank line, the body.
// The token is only ever sent in a request header; it is never printed.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** `https://host/group/repo.git`, `git@host:group/repo.git`, `ssh://git@host:2222/group/repo` → web host + path. */
export const parseRemote = (url) => {
  const match =
    url.match(/^https?:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/) ??
    url.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/) ??
    url.match(/^(?:[^@/]+@)?([^/:]+):(?!\d+\/)(.+?)(?:\.git)?\/?$/);
  return match ? { host: match[1], path: match[2] } : null;
};

/** Title on the first line, then a blank line, then the body. */
export const parseDraft = (text) => {
  const [title = '', ...rest] = text.replace(/\r\n/g, '\n').split('\n');
  return { title: title.replace(/^#\s+/, '').trim(), body: rest.join('\n').trim() };
};

export const newMergeRequestUrl = ({ host, path }, { source, target, title, body, draft = false }) => {
  const params = new URLSearchParams({
    'merge_request[source_branch]': source,
    'merge_request[target_branch]': target,
    'merge_request[title]': draft && !/^draft:/i.test(title) ? `Draft: ${title}` : title,
    'merge_request[description]': body,
  });
  return `https://${host}/${path}/-/merge_requests/new?${params}`;
};

/** API route listing the open MRs whose source is `branch`. */
export const openMergeRequestsRoute = (projectPath, branch) => {
  const query = new URLSearchParams({ state: 'opened', source_branch: branch });
  return `/projects/${encodeURIComponent(projectPath)}/merge_requests?${query}`;
};

/** The fields create-pr needs from a GitLab MR, or null when there is none. */
export const summarizeMergeRequest = (mr) =>
  mr
    ? {
        iid: mr.iid,
        web_url: mr.web_url,
        target_branch: mr.target_branch,
        title: mr.title,
        draft: Boolean(mr.draft ?? mr.work_in_progress),
      }
    : null;

/** The command that opens a URL in the default browser on this platform. */
export const browserCommand = (platform = process.platform) =>
  platform === 'darwin'
    ? { command: 'open', args: [] }
    : platform === 'win32'
      ? { command: 'cmd', args: ['/c', 'start', ''] }
      : { command: 'xdg-open', args: [] };

/** Opens `url` in the default browser; returns true when the opener ran successfully. */
export const openInBrowser = (url) => {
  const { command, args } = browserCommand();
  const result = spawnSync(command, [...args, url], { stdio: 'ignore' });
  return result.status === 0;
};

/** Prints the link; with --open also opens it, and says plainly whether that worked. */
export const deliverLink = (url, open, label = 'link') => {
  console.log(url);
  if (!open) return;
  if (openInBrowser(url)) console.error(`Opened the ${label} in your default browser.`);
  else console.error(`Could not open a browser; give the user the link above exactly as printed.`);
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const fail = (message, code = 1) => {
  process.stderr.write(`gitlab-mr: ${message}\n`);
  process.exitCode = code;
};

const api = async (remote, token, method, route, body) => {
  const response = await fetch(`https://${remote.host}/api/v4${route}`, {
    method,
    headers: { 'PRIVATE-TOKEN': token, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${route} → HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
};

const tokenOrFail = (hint) => {
  const token = process.env.GITLAB_TOKEN;
  if (!token) fail(`GITLAB_TOKEN is not set; ${hint}`, 3);
  return token;
};

const openMergeRequest = async (remote, token) => {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const [mr] = await api(remote, token, 'GET', openMergeRequestsRoute(remote.path, branch));
  return { branch, mr };
};

const describe = async (remote, draftFile) => {
  const token = tokenOrFail('use new-url or paste the description by hand.');
  if (!token) return;

  const { body } = parseDraft(readFileSync(draftFile, 'utf8'));
  if (!body) return fail(`${draftFile} has no description body.`);

  const { branch, mr } = await openMergeRequest(remote, token);
  if (!mr) return fail(`no open merge request for ${branch}; push it first.`);

  const project = `/projects/${encodeURIComponent(remote.path)}`;
  const updated = await api(remote, token, 'PUT', `${project}/merge_requests/${mr.iid}`, { description: body });
  console.log(`Updated the description of !${updated.iid}: ${updated.web_url}`);
};

const info = async (remote) => {
  const token = tokenOrFail('look for "View merge request for" in the push output instead.');
  if (!token) return;

  const { mr } = await openMergeRequest(remote, token);
  console.log(JSON.stringify(summarizeMergeRequest(mr)));
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  const remote = parseRemote(git('remote', 'get-url', 'origin'));
  if (!remote) return fail('origin is not a URL this helper understands.');

  if (command === 'describe' && args[0]) return describe(remote, args[0]);
  if (command === 'info') return info(remote);

  if (command === 'new-url' && args[0] && args[1]) {
    const { title, body } = parseDraft(readFileSync(args[1], 'utf8'));
    const source = git('rev-parse', '--abbrev-ref', 'HEAD');
    const url = newMergeRequestUrl(remote, { source, target: args[0], title, body, draft: args.includes('--draft') });
    deliverLink(url, args.includes('--open'), '"New merge request" page');
    return;
  }

  fail('usage: gitlab-mr.mjs describe <draft-file> | info | new-url <target-branch> <draft-file> [--draft] [--open]', 2);
};

// Ends by returning, never process.exit(): see format-on-edit.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.message));
}
