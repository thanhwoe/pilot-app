#!/usr/bin/env node
// Numbers for the factory log and the baseline, from GitHub alone (ADR-007, kit #30). Uses `gh api`.
//
//   node metrics.mjs baseline <owner/repo> [--since <date>]
//       one row per merged PR in a repo worked without the factory: first commit → merge, commits
//       pushed after the PR opened, review rounds, size, and fix PRs within 14 days on its files
//   node metrics.mjs parallel <owner/repo> --since <date> [--until <date>]
//       the most issues labelled `building` at one moment in the window
//   node metrics.mjs ready <owner/repo> <issue> <merged_at>
//       hours from the issue's last `ready` label to the merge
//   node metrics.mjs escaped <owner/repo> --since <date> [--until <date>]
//       bugs whose "Found in" field names an issue or PR, filed in the window
//
// Each prints JSON. Titles, names and bodies never appear in the output: numbers only (ADR-001).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const round1 = (n) => Math.round(n * 10) / 10;
const ms = (iso) => Date.parse(iso);

class UsageError extends Error {}

export const buildingIntervals = (issue, events, now = new Date().toISOString()) => {
  const out = [];
  let start = null;
  for (const e of events) {
    const isBuilding = e.label?.name === 'building';
    if (e.event === 'labeled' && isBuilding && start === null) start = e.created_at;
    else if (start !== null && ((e.event === 'unlabeled' && isBuilding) || e.event === 'closed')) {
      out.push({ issue, start, end: e.created_at });
      start = null;
    }
  }
  if (start !== null) out.push({ issue, start, end: now });
  return out;
};

export const peakConcurrent = (intervals) => {
  let best = { peak: 0, at: null, issues: [] };
  for (const { start } of intervals) {
    const open = intervals.filter((i) => ms(i.start) <= ms(start) && ms(start) < ms(i.end));
    if (open.length > best.peak) {
      best = { peak: open.length, at: start, issues: [...new Set(open.map((i) => i.issue))].sort((a, b) => a - b) };
    }
  }
  return best;
};

export const readyToMerge = (events, mergedAt) => {
  const readies = events.filter(
    (e) => e.event === 'labeled' && e.label?.name === 'ready' && ms(e.created_at) <= ms(mergedAt),
  );
  if (readies.length === 0) return null;
  return round1((ms(mergedAt) - ms(readies.at(-1).created_at)) / HOUR);
};

const kindOf = (title) => /^\s*(\w+)(\(.+?\))?!?:/.exec(title ?? '')?.[1].toLowerCase() ?? 'other';

export const baselineRow = (pr, commits, reviews) => {
  const dates = commits.map((c) => c.commit.author.date).sort();
  const first = dates[0] ?? pr.created_at;
  return {
    pr: pr.number,
    kind: kindOf(pr.title),
    merged_at: pr.merged_at,
    lead_h: round1((ms(pr.merged_at) - ms(first)) / HOUR),
    commits: commits.length,
    commits_after_open: dates.filter((d) => ms(d) > ms(pr.created_at)).length,
    review_rounds: reviews.filter((r) => r.state === 'CHANGES_REQUESTED').length,
    additions: pr.additions,
    deletions: pr.deletions,
    files: pr.changed_files,
  };
};

/** Fix PRs merged within 14 days after `row` that change one of its files. */
export const laterFixes = (row, rows) => {
  const files = new Set(row.fileSet);
  return rows
    .filter(
      (r) =>
        r.kind === 'fix' &&
        ms(r.merged_at) > ms(row.merged_at) &&
        ms(r.merged_at) - ms(row.merged_at) <= 14 * DAY &&
        r.fileSet.some((f) => files.has(f)),
    )
    .map((r) => r.pr);
};

/** The number in a bug issue form's "Found in" field: `#118` or an issue or PR link. */
export const foundIn = (body) => {
  const m = /### Found in\s*\n+\s*(?:#(\d+)|https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/(\d+))/.exec(
    body ?? '',
  );
  return m ? Number(m[1] ?? m[2]) : null;
};

const gh = (endpoint) => {
  const out = execFileSync('gh', ['api', '--paginate', endpoint, '--jq', '.[]'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
};
const ghOne = (endpoint) =>
  JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const option = (args, name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const repoArg = (value) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(value ?? '')) throw new UsageError('give the repository as owner/name');
  return value;
};

const commands = {
  baseline(args) {
    const repo = repoArg(args[0]);
    const since = option(args, '--since');
    const prs = gh(`repos/${repo}/pulls?state=closed&per_page=100`).filter(
      (p) => p.merged_at && (!since || ms(p.merged_at) >= ms(since)),
    );
    const rows = prs
      .map((p) => {
        const full = ghOne(`repos/${repo}/pulls/${p.number}`);
        const row = baselineRow(
          full,
          gh(`repos/${repo}/pulls/${p.number}/commits?per_page=100`),
          gh(`repos/${repo}/pulls/${p.number}/reviews?per_page=100`),
        );
        return { ...row, fileSet: gh(`repos/${repo}/pulls/${p.number}/files?per_page=100`).map((f) => f.filename) };
      })
      .sort((a, b) => ms(a.merged_at) - ms(b.merged_at));
    return rows.map(({ fileSet, ...row }) => ({ ...row, fixes_14d: laterFixes({ ...row, fileSet }, rows) }));
  },
  parallel(args) {
    const repo = repoArg(args[0]);
    const since = option(args, '--since');
    if (!since) throw new UsageError('parallel needs --since <date>');
    const until = option(args, '--until') ?? new Date().toISOString();
    const issues = gh(`repos/${repo}/issues?state=all&since=${since}&per_page=100`).filter((i) => !i.pull_request);
    const intervals = issues
      .flatMap((i) => buildingIntervals(i.number, gh(`repos/${repo}/issues/${i.number}/events?per_page=100`), until))
      .filter((i) => ms(i.end) > ms(since) && ms(i.start) < ms(until));
    return peakConcurrent(intervals);
  },
  ready(args) {
    const repo = repoArg(args[0]);
    if (!/^\d+$/.test(args[1] ?? '') || !args[2]) throw new UsageError('ready needs <issue> <merged_at>');
    return { issue: Number(args[1]), ready_h: readyToMerge(gh(`repos/${repo}/issues/${args[1]}/events?per_page=100`), args[2]) };
  },
  escaped(args) {
    const repo = repoArg(args[0]);
    const since = option(args, '--since');
    if (!since) throw new UsageError('escaped needs --since <date>');
    const until = option(args, '--until') ?? new Date().toISOString();
    return gh(`repos/${repo}/issues?state=all&since=${since}&per_page=100`)
      .filter((i) => !i.pull_request && ms(i.created_at) >= ms(since) && ms(i.created_at) < ms(until))
      .map((i) => ({ bug: i.number, created_at: i.created_at, found_in: foundIn(i.body) }))
      .filter((b) => b.found_in !== null);
  },
};

const USAGE =
  'usage: metrics.mjs baseline <owner/repo> [--since <date>] | parallel <owner/repo> --since <date> [--until <date>] | ready <owner/repo> <issue> <merged_at> | escaped <owner/repo> --since <date> [--until <date>]';

const main = () => {
  const [command, ...args] = process.argv.slice(2);
  if (!(command in commands)) throw new UsageError('');
  console.log(JSON.stringify(commands[command](args)));
};

// Ends by returning, never process.exit(): see format-on-edit.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message ? `metrics: ${error.message}\n` : ''}${USAGE}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`metrics: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
