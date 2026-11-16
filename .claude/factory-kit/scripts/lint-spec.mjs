#!/usr/bin/env node
// The structural checks of a spec and its plan, so a retro's lesson can fail a check instead of
// adding a sentence to a skill (kit #29):
//
//   node lint-spec.mjs <N> [--dir <specs dir>]
//
// Run it from the repository root. It reads <dir>/<N>.md and, if it exists, <dir>/<N>-plan.md
// (dir defaults to docs/specs), prints one line per problem, and exits 1 when there is any.
// Judgement stays with the skill: whether a criterion is testable, whether an assumption promises
// a behaviour, whether anything came from neither the issue nor intake.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class UsageError extends Error {}

/** The lines under a `## <title>` heading, up to the next `## `. */
const section = (lines, title) => {
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start === -1) return { start: -1, body: [] };
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return { start: start + 1, body: end === -1 ? rest : rest.slice(0, end) };
};

/** Numbered items (`1. …`) with their continuation lines. */
const numberedItems = (body) => {
  const items = [];
  for (const line of body) {
    const m = /^(\d+)\.\s+(.*)$/.exec(line);
    if (m) items.push({ n: Number(m[1]), text: m[2] });
    else if (items.length && line.trim() !== '') items.at(-1).text += `\n${line.trim()}`;
  }
  return items;
};

/** Splits a Markdown table row into cells. `\|` stays inside its cell. */
const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

const isTableLine = (line) => line.trim().startsWith('|');

/** Every table in the file: its header line number, header width, and rows. */
const tables = (lines) => {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isTableLine(lines[i]) || (i > 0 && isTableLine(lines[i - 1]))) continue;
    const width = cells(lines[i]).length;
    const rows = [];
    for (let j = i + 1; j < lines.length && isTableLine(lines[j]); j++) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[j])) continue; // the --- separator
      rows.push({ line: j + 1, cells: cells(lines[j]) });
    }
    out.push({ line: i + 1, width, rows });
  }
  return out;
};

/** The references in an AC cell or a step's AC part: criterion numbers, ranges (`1–7`) and `A<k>`. */
const refs = (text) =>
  (text.match(/\bA\d+\b|\b\d+\s*[–-]\s*\d+\b|\b\d+\b/g) ?? []).flatMap((r) => {
    if (r.startsWith('A')) return [r];
    const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(r);
    if (!range) return [Number(r)];
    const [from, to] = [Number(range[1]), Number(range[2])];
    return to >= from && to - from < 100 ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
  });

export const parseSpec = (text) => {
  const lines = text.split('\n');
  const criteria = numberedItems(section(lines, 'Acceptance criteria').body)
    .filter((c) => !/^(\(removed|~~)/i.test(c.text.trim()))
    .map((c) => ({ ...c, security: /^`?\[security\]/i.test(c.text.trim()) }));
  // Assumptions are a bulleted or a numbered list; A<k> is the k-th.
  const assumptions = section(lines, 'Assumptions').body.filter((l) => /^([-*]|\d+\.)\s+/.test(l)).length;
  const matrixSection = section(lines, 'Test matrix');
  const matrix = tables(matrixSection.body)[0]?.rows.map((r) => ({ ...r, refs: refs(r.cells[0] ?? '') })) ?? [];
  return { lines, criteria, assumptions, matrix };
};

/** What a manual row's evidence can be: something the PR carries or links. */
const EVIDENCE = /\b(PR|screenshots?|logs?|links?|recordings?|videos?|photos?|output)\b/i;

export const lintSpec = (text, { exists }) => {
  const { lines, criteria, assumptions, matrix } = parseSpec(text);
  const problems = [];
  for (const c of criteria) {
    for (const word of ['Given', 'When', 'Then']) {
      if (!new RegExp(`\\b${word}\\b`, 'i').test(c.text)) problems.push(`AC ${c.n} has no ${word}`);
    }
  }
  const covered = new Set(matrix.flatMap((r) => r.refs));
  for (const c of criteria) if (!covered.has(c.n)) problems.push(`AC ${c.n} has no row in the test matrix`);
  for (const r of matrix) {
    for (const ref of r.refs) {
      if (typeof ref === 'string' && Number(ref.slice(1)) > assumptions) {
        problems.push(`${ref} in the test matrix, but there are only ${assumptions} assumptions`);
      }
    }
    const row = r.cells.join(' | ');
    const label = r.cells[0];
    if (/\bmanual\b/i.test(r.cells[2] ?? '') && !EVIDENCE.test(row)) {
      problems.push(`test matrix row for ${label} is manual but doesn't say what evidence the PR carries`);
    }
    if (/\bexisting\b/i.test(row)) {
      const files = [...row.matchAll(/`([^`\s]+\.[A-Za-z0-9]+)`/g)].map((m) => m[1]).filter((f) => f.includes('/'));
      if (files.length === 0) problems.push(`test matrix row for ${label} calls a test existing, but names no file`);
      for (const f of files) {
        if (!exists(f)) problems.push(`test matrix row for ${label} calls a test existing, but ${f} is not there`);
      }
    }
  }
  for (const t of tables(lines)) {
    for (const r of t.rows) {
      if (r.cells.length !== t.width) {
        problems.push(`line ${r.line}: ${r.cells.length} cells, the header has ${t.width} (escape a | inside a cell as \\|)`);
      }
    }
  }
  return problems;
};

const SEARCH = /`(?:grep|rg|git grep)\b[^`]*`/;
// An instruction to remove or rename a named thing: "remove the unused `name`", "rename `a` to `b`".
// A test name or a behaviour ("deletes the token") isn't one.
const REMOVES = /\b(?:remove|rename|delete|drop)\s+(?:the\s+)?(?:unused\s+|old\s+)?`/i;

export const lintPlan = (planText, specText) => {
  const { criteria, matrix } = parseSpec(specText);
  const steps = numberedItems(section(planText.split('\n'), 'Steps').body).map((s) => {
    const parts = s.text.split(' · ');
    // The part that lists the criteria: `AC 1, 2`, `AC 3 [security], A2` or `A1`.
    const acSegment = parts.find((p) => /^\s*(AC\b|A\d)/.test(p)) ?? '';
    return { ...s, tag: /^`(cloud|mac)`$/.test(parts[0]?.trim() ?? ''), acSegment, refs: refs(acSegment) };
  });
  const problems = [];
  const inSteps = new Set(steps.flatMap((s) => s.refs));
  for (const c of criteria) {
    if (!inSteps.has(c.n)) problems.push(`AC ${c.n}${c.security ? ' [security]' : ''} is in no step`);
  }
  const promised = [...new Set(matrix.flatMap((r) => r.refs).filter((r) => typeof r === 'string'))];
  for (const a of promised) if (!inSteps.has(a)) problems.push(`${a} from the test matrix is in no step`);
  for (const s of steps) {
    if (!s.tag) problems.push(`step ${s.n} has no \`cloud\` or \`mac\` tag`);
    if (!/\bdone when\b/i.test(s.text)) problems.push(`step ${s.n} has no "done when"`);
    if (REMOVES.test(s.text) && !SEARCH.test(s.text)) {
      problems.push(`step ${s.n} removes or renames something but names no search (\`grep\`, \`rg\` or \`git grep\`)`);
    }
  }
  return problems;
};

const main = () => {
  const args = process.argv.slice(2);
  const n = args[0];
  if (!/^\d+$/.test(n ?? '')) throw new UsageError('give the issue number');
  const i = args.indexOf('--dir');
  const dir = i === -1 ? path.join('docs', 'specs') : args[i + 1];
  const specFile = path.join(dir, `${n}.md`);
  if (!existsSync(specFile)) throw new UsageError(`${specFile} does not exist`);
  const specText = readFileSync(specFile, 'utf8');
  const report = [[specFile, lintSpec(specText, { exists: (f) => existsSync(f) })]];
  const planFile = path.join(dir, `${n}-plan.md`);
  if (existsSync(planFile)) report.push([planFile, lintPlan(readFileSync(planFile, 'utf8'), specText)]);
  for (const [file, problems] of report) {
    if (problems.length === 0) console.log(`${file}: ok`);
    for (const p of problems) console.log(`${file}: ${p}`);
  }
  if (report.some(([, problems]) => problems.length > 0)) process.exitCode = 1;
};

// Ends by returning, never process.exit(): see format-on-edit.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`lint-spec: ${error.message}\nusage: lint-spec.mjs <N> [--dir <specs dir>]\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`lint-spec: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
