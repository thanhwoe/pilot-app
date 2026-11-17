#!/usr/bin/env node
// The hidden line that ends every comment the factory posts, so later steps find factory comments by
// data instead of by their wording (ADR-006, kit #36):
//
//   node factory-marker.mjs line <stage> <issue> ['<json fields>']
//       prints `<!-- factory-kit {"stage":…,"issue":…,"kit":…,…} -->`; append it to the comment body
//   node factory-marker.mjs line capture - ['<json fields>']
//       the same, with no issue: capture puts it at the end of the body of the issue it creates
//   node factory-marker.mjs read <comments file>
//       prints {"markers":[…],"untrusted":n}. The file holds the issue's comments as a JSON array, or
//       one per line (`gh api --paginate …/comments --jq '.[]'`). A marker counts only on a comment
//       whose author_association is OWNER, MEMBER or COLLABORATOR; others are counted in `untrusted`.
//   node factory-marker.mjs body <issue file>
//       prints {"marker":{…}|null,"untrusted":bool} for the marker in an issue's body
//       (`gh api …/issues/<N> > <file>`), counted on the same terms.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAGES = ['capture', 'intake', 'spec', 'plan', 'qa', 'handover', 'retro'];
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const FIXED = ['stage', 'issue', 'kit'];
const MARKER = /<!-- factory-kit (\{.*\}) -->/g;

class UsageError extends Error {}

/** The kit's version: the plugin's plugin.json, or the vendored copy's manifest.json. */
export const kitVersion = (scriptsDir) => {
  for (const file of [
    path.join(scriptsDir, '..', '.claude-plugin', 'plugin.json'),
    path.join(scriptsDir, '..', 'manifest.json'),
  ]) {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')).version;
  }
  return 'unknown';
};

export const markerLine = (stage, issue, fields, version) => {
  if (!STAGES.includes(stage)) throw new UsageError(`stage must be one of ${STAGES.join(', ')}`);
  // capture writes its marker into the body of the issue it is about to create, so no number yet.
  const noIssue = stage === 'capture' && issue === '-';
  if (!noIssue && !/^\d+$/.test(String(issue))) throw new UsageError('issue must be a number');
  for (const key of FIXED) if (key in fields) throw new UsageError(`fields can't set ${key}`);
  const head = noIssue ? { stage } : { stage, issue: Number(issue) };
  const json = JSON.stringify({ ...head, kit: version, ...fields });
  if (json.includes('-->')) throw new UsageError("fields can't contain -->, which would end the comment");
  return `<!-- factory-kit ${json} -->`;
};

/** A JSON array of comments, or one comment per line. */
export const parseComments = (text) => {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
};

const lastMarker = (body) => {
  let found = null;
  for (const match of (body ?? '').matchAll(MARKER)) {
    try {
      const data = JSON.parse(match[1]);
      if (STAGES.includes(data.stage)) found = data;
    } catch {
      // A broken marker is not a marker.
    }
  }
  return found;
};

export const readMarkers = (comments) => {
  const markers = [];
  let untrusted = 0;
  for (const c of comments) {
    const data = lastMarker(c.body);
    if (!data) continue;
    if (!TRUSTED.has(c.author_association)) {
      untrusted += 1;
      continue;
    }
    markers.push({ id: c.id, created_at: c.created_at, html_url: c.html_url, ...data });
  }
  return { markers, untrusted };
};

/** The marker in an issue's body, counted only when its author has write access. */
export const bodyMarker = (issue) => {
  const marker = lastMarker(issue.body);
  if (marker && !TRUSTED.has(issue.author_association)) return { marker: null, untrusted: true };
  return { marker, untrusted: false };
};

const USAGE =
  "usage: factory-marker.mjs line <stage> <issue|-> ['<json fields>'] | read <comments file> | body <issue file>";

const main = () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'line' && (args.length === 2 || args.length === 3)) {
    let fields = {};
    if (args[2] !== undefined) {
      try {
        fields = JSON.parse(args[2]);
      } catch {
        throw new UsageError('fields must be a JSON object');
      }
      if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
        throw new UsageError('fields must be a JSON object');
      }
    }
    const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
    console.log(markerLine(args[0], args[1], fields, kitVersion(scriptsDir)));
    return;
  }
  if (command === 'read' && args.length === 1) {
    console.log(JSON.stringify(readMarkers(parseComments(readFileSync(args[0], 'utf8')))));
    return;
  }
  if (command === 'body' && args.length === 1) {
    console.log(JSON.stringify(bodyMarker(JSON.parse(readFileSync(args[0], 'utf8')))));
    return;
  }
  throw new UsageError('');
};

// Ends by returning, never process.exit(): see format-on-edit.mjs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message ? `factory-marker: ${error.message}\n` : ''}${USAGE}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`factory-marker: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
