#!/usr/bin/env node
// Who holds an issue's claim, so two sessions never build or test one issue at once (kit #41,
// ADR-014). Each track has its own label, because build and QA run side by side on one issue:
//
//   gh api repos/{owner}/{repo}/issues/<N>/events --paginate --jq '.[]' \
//     | node claim.mjs status <claimed:build|claimed:qa> <your GitHub login>
//
// prints one JSON line:
//   {"state":"free"}                                   nobody holds it: add the label, then ask again
//   {"state":"own","since":"<time>"}                   you added it: carry on (a resume)
//   {"state":"held","by":"<login>","since":"<time>"}   someone else added it: stop
//
// The holder is whoever added the label last, while it is still on the issue. A session can't tell
// itself from another session of the same person, so "own" means the same GitHub login.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CLAIM_LABELS = ['claimed:build', 'claimed:qa'];

const USAGE = "Usage: gh api …/issues/<N>/events --paginate --jq '.[]' | node claim.mjs status <label> <login>";

class UsageError extends Error {}

/** Issue events as a JSON array, or one per line (`gh api --paginate … --jq '.[]'`). */
export const parseEvents = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
};

/** The claim on `label`, as seen by `login`: free, own or held. */
export const claimState = (events, label, login) => {
  const ordered = events
    .filter((e) => e?.label?.name === label && (e.event === 'labeled' || e.event === 'unlabeled'))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let holder = null;
  for (const e of ordered) {
    holder = e.event === 'labeled' ? { by: e.actor?.login ?? '', since: e.created_at } : null;
  }
  if (!holder) return { state: 'free' };
  if (holder.by.toLowerCase() === login.toLowerCase()) return { state: 'own', since: holder.since };
  return { state: 'held', by: holder.by, since: holder.since };
};

const main = () => {
  const [command, label, login, ...rest] = process.argv.slice(2);
  if (command !== 'status' || !login || rest.length) throw new UsageError('');
  if (!CLAIM_LABELS.includes(label)) throw new UsageError(`label must be one of ${CLAIM_LABELS.join(', ')}`);
  console.log(JSON.stringify(claimState(parseEvents(readFileSync(0, 'utf8')), label, login)));
};

// Ends by returning, never process.exit(): see format-on-edit.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message ? `claim: ${error.message}\n` : ''}${USAGE}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`claim: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
