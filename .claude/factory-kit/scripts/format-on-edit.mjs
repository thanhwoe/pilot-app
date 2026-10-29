#!/usr/bin/env node
// PostToolUse hook (Edit|Write|MultiEdit): run the project's own formatter on the file Claude just
// changed, so edits arrive formatted instead of waiting for lint-staged at commit time. That is
// Biome when the repo configures it (a biome.json(c) between the file and the repo root, and Biome
// in node_modules), else Prettier.
// Never blocks: a formatting failure, or input it can't read, is logged on stderr (shown in verbose
// mode; Claude doesn't see it for a hook that exits 0) and the edit stands. Does nothing in a repo
// without either formatter in node_modules. The `enable_format` option turns the whole hook off.
//
// Ends by returning, never process.exit(): Node 24.7 can segfault in process.exit() after
// reading stdin, and Claude Code would report that as a hook error.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { optionEnabled } from './options.mjs';

const FORMATTED = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|vue|ya?ml)$/;
// Matched against the path inside the repo, so a repo that itself lives under build/ still works.
const SKIPPED = /(^|\/)(node_modules|\.git|\.next|\.nuxt|\.turbo|dist|build|coverage|vendor)\//;

const git = (cwd, ...args) => {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

// Real paths throughout: a project opened through a symlink must still match git's resolved root.
const real = (target) => (target && existsSync(target) ? realpathSync(target) : target);

const main = () => {
  if (!optionEnabled(process.env.CLAUDE_PLUGIN_OPTION_ENABLE_FORMAT)) return;

  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !FORMATTED.test(filePath)) return;

  const cwd = real(input.cwd);
  const projectDir = real(process.env.CLAUDE_PROJECT_DIR) || cwd || process.cwd();

  const absolute = real(path.resolve(cwd || projectDir, filePath));
  if (!existsSync(absolute)) return;

  // Format from the checkout that owns the file. A session in a nested worktree can report the main
  // checkout as CLAUDE_PROJECT_DIR; run from there, Prettier reads the main .gitignore and may
  // silently skip the file.
  const root = git(path.dirname(absolute), 'rev-parse', '--show-toplevel');
  const commonDir = (dir) => {
    const common = dir && git(dir, 'rev-parse', '--git-common-dir');
    return common && path.resolve(dir, common);
  };

  // Only this repository and its worktrees; another project's files are not ours to format.
  if (!root || commonDir(root) !== commonDir(projectDir)) return;

  const relative = path.relative(root, absolute);
  if (SKIPPED.test(relative)) return;

  // Walk up from the file to the repo root, so monorepo packages work too: the nearest binaries
  // (pnpm may hoist them to the root), and whether any directory on the way configures Biome.
  let prettier = null;
  let biome = null;
  let biomeConfigured = false;
  for (let dir = path.dirname(absolute); ; dir = path.dirname(dir)) {
    const bin = (name) => {
      const file = path.join(dir, 'node_modules', '.bin', name);
      return existsSync(file) ? file : null;
    };
    prettier ||= bin('prettier');
    biome ||= bin('biome');
    biomeConfigured ||= ['biome.json', 'biome.jsonc'].some((name) => existsSync(path.join(dir, name)));
    if (dir === root || dir === path.dirname(dir)) break;
  }

  // Run from the owning root so its config and ignore files apply.
  // Biome: `check --write` formats and applies assist actions such as organizing imports, with the
  // linter off so no lint fix changes behaviour; unknown or ignored files are not an error.
  // Prettier: `--ignore-unknown` skips odd files. `--log-level=warn` as one word: Prettier 2 ignores
  // the unknown flag instead of reading `warn` as a file to format.
  const formatter =
    biome && biomeConfigured
      ? {
          name: 'biome',
          bin: biome,
          args: ['check', '--write', '--linter-enabled=false', '--files-ignore-unknown=true', '--no-errors-on-unmatched'],
        }
      : prettier && { name: 'prettier', bin: prettier, args: ['--write', '--ignore-unknown', '--log-level=warn'] };
  if (!formatter) return; // no formatter, or dependencies not installed yet

  const result = spawnSync(formatter.bin, [...formatter.args, relative], { cwd: root, encoding: 'utf8' });

  if (result.status !== 0) {
    const detail = result.error ? `${result.error.message}\n` : result.stderr;
    process.stderr.write(`factory-kit format-on-edit: ${formatter.name} failed on ${relative}\n${detail}`);
  }
};

try {
  main();
} catch (error) {
  // Never block an edit: report and leave the file as it is.
  process.stderr.write(`factory-kit format-on-edit: skipped (${error.message})\n`);
}
