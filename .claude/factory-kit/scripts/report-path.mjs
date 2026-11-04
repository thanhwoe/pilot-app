#!/usr/bin/env node
// Prints where factory-kit keeps its per-branch files, so the skill that writes one and the skill that
// reads it always agree, whatever TMPDIR the shell has:
//
//   node report-path.mjs pr       → <tmp>/factory-kit/<repo>/<branch>.md          (describe-pr, create-pr)
//   node report-path.mjs verify   → <tmp>/factory-kit/<repo>/<branch>-verify.md   (verify, describe-pr)
//   node report-path.mjs triage   → <tmp>/factory-kit/<repo>/<branch>-triage.md   (triage)
//   node report-path.mjs report   → <tmp>/factory-kit/<repo>/<branch>-report.md   (report)
//
// It creates the directory, not the file. Run it from inside the repository.

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUFFIX = { pr: '', verify: '-verify', triage: '-triage', report: '-report' };

/** `<tmp>/factory-kit/<repo>/<branch><suffix>.md`, with `/` in the branch name turned into `-`. */
export const reportPath = (kind, { repoRoot, branch, tmp = tmpdir() }) =>
  path.join(tmp, 'factory-kit', path.basename(repoRoot), `${branch.replaceAll('/', '-')}${SUFFIX[kind]}.md`);

const main = () => {
  const kind = process.argv[2];
  if (!(kind in SUFFIX)) {
    process.stderr.write('usage: report-path.mjs pr|verify|triage|report\n');
    process.exitCode = 2;
    return;
  }
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const file = reportPath(kind, { repoRoot: git('rev-parse', '--show-toplevel'), branch: git('rev-parse', '--abbrev-ref', 'HEAD') });
  mkdirSync(path.dirname(file), { recursive: true });
  console.log(file);
};

// Ends by returning, never process.exit(): see format-on-edit.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`report-path: ${error.message}\n`);
    process.exitCode = 1;
  }
}
