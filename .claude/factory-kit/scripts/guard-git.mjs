#!/usr/bin/env node
// PreToolUse hook (Bash): stop the git commands that should never come from Claude, in any repo.
// Best-effort guardrail, not a security boundary: it parses command text, so an obfuscated command
// (eval, aliases, scripts) can slip past. Permission rules are the hard control.
//
// Protected branches come from the plugin's `protected_branches` option
// (CLAUDE_PLUGIN_OPTION_PROTECTED_BRANCHES), comma-separated. The `enable_guard` option turns the
// whole hook off.
//
// Ends by returning, never process.exit(): Node 24.7 can segfault in process.exit() after
// reading stdin. If the input can't be checked, it fails closed (exit code 2 blocks the command).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { optionEnabled } from './options.mjs';

export const DEFAULT_PROTECTED = ['main', 'master', 'develop', 'staging'];
// `.env` and `.env.local`, `.env.production`…, but not the committed templates.
const SECRET_FILE = /(^|\/)\.env(\.(?!example$|sample$|template$)[\w.-]+)?$/;

/** git's own options before the subcommand that take the next word as their value. */
const GLOBAL_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path']);
/** Per subcommand: options whose value is data (a message, a push option), never a ref or flag. */
const VALUE_OPTIONS = {
  commit: { short: 'mFCct', long: ['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--trailer', '--fixup', '--squash', '--cleanup'] },
  push: { short: 'o', long: ['--push-option', '--repo', '--receive-pack', '--exec'] },
  merge: { short: 'mFsX', long: ['--message', '--file', '--strategy', '--strategy-option'] },
  pull: { short: 'sX', long: ['--strategy', '--strategy-option'] },
  rebase: { short: 'sX', long: ['--strategy', '--strategy-option', '--onto', '--exec'] },
  am: { short: '', long: ['--directory', '--exclude', '--include'] },
  add: { short: '', long: ['--chmod', '--pathspec-from-file'] },
};
/** Subcommands that run git hooks a `--no-verify` would skip. */
const HOOKED = new Set(['commit', 'push', 'merge', 'pull', 'rebase', 'am']);
const SEPARATORS = new Set(['&&', '||', ';', '|', '&', '(', ')', '\n']);

export const parseBranches = (value) => {
  const branches = (value ?? '')
    .split(',')
    .map((branch) => branch.trim())
    .filter(Boolean);
  return branches.length ? branches : DEFAULT_PROTECTED;
};

const gitOutput = (cwd, ...args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
};

/**
 * Splits a shell command into simple commands, each a list of words, the way sh would see them:
 * quotes are removed but keep their content as one word, `\` escapes, `\`+newline continues the
 * line, and `&& || ; | & ( )` and newlines separate commands. `#` comments and here-document
 * bodies are skipped: they are data, not commands. No expansion is attempted.
 * The result has a non-enumerable `unbalanced` flag when a quote is never closed.
 */
export const tokenize = (command) => {
  const commands = [[]];
  let word = null;
  let unbalanced = false;
  const heredocs = []; // delimiters whose bodies start after the current line
  const end = () => {
    if (word !== null) commands.at(-1).push(word);
    word = null;
  };
  const split = () => {
    end();
    if (commands.at(-1).length) commands.push([]);
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const two = command.slice(i, i + 2);
    if (ch === '\\') {
      if (command[i + 1] === '\n') i++;
      else word = (word ?? '') + (command[++i] ?? '');
    } else if (ch === "'" || ch === '"') {
      // Inside double quotes `\"` doesn't close the word, so skip escaped characters while looking
      // for the closing quote. Single quotes have no escapes.
      let stop = i + 1;
      while (stop < command.length && command[stop] !== ch) stop += ch === '"' && command[stop] === '\\' ? 2 : 1;
      if (stop >= command.length) unbalanced = true;
      stop = Math.min(stop, command.length);
      word = (word ?? '') + command.slice(i + 1, stop).replace(ch === '"' ? /\\(["\\$`])/g : /$^/, '$1');
      i = stop;
    } else if (ch === '#' && word === null) {
      const eol = command.indexOf('\n', i);
      i = (eol === -1 ? command.length : eol) - 1; // a comment runs to the end of the line
    } else if (two === '<<' && command[i + 2] !== '<') {
      // Here-document: remember the delimiter (`<<EOF`, `<<-EOF`, `<<'EOF'`); the body is skipped
      // at the next newline.
      end();
      let j = i + 2;
      const stripTabs = command[j] === '-';
      if (stripTabs) j++;
      while (command[j] === ' ' || command[j] === '\t') j++;
      let delimiter = '';
      while (j < command.length && !/[\s;&|()<>]/.test(command[j])) {
        if (command[j] === "'" || command[j] === '"') {
          const close = command.indexOf(command[j], j + 1);
          const stop = close === -1 ? command.length : close;
          delimiter += command.slice(j + 1, stop);
          j = stop + 1;
        } else if (command[j] === '\\') {
          delimiter += command[j + 1] ?? '';
          j += 2;
        } else {
          delimiter += command[j++];
        }
      }
      if (delimiter) heredocs.push({ delimiter, stripTabs });
      i = j - 1;
    } else if (ch === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) {
      word = (word ?? '') + ch; // a redirection such as 2>&1 or &>file, not a separator
    } else if (ch === '\n') {
      split();
      let next = i + 1;
      for (const { delimiter, stripTabs } of heredocs.splice(0)) {
        while (next < command.length) {
          const eol = command.indexOf('\n', next);
          const lineEnd = eol === -1 ? command.length : eol;
          const line = command.slice(next, lineEnd);
          next = lineEnd + 1;
          if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) break;
        }
      }
      i = next - 1;
    } else if (SEPARATORS.has(two) || SEPARATORS.has(ch)) {
      split();
      if (SEPARATORS.has(two)) i++;
    } else if (/\s/.test(ch)) {
      end();
    } else {
      word = (word ?? '') + ch;
    }
  }
  end();
  const result = commands.filter((words) => words.length);
  Object.defineProperty(result, 'unbalanced', { value: unbalanced });
  return result;
};

/**
 * For a git command, its arguments after `git` and the `VAR=value` assignments in front of it, with
 * `env`, `command`, `exec`, `sudo` and a path like /usr/bin/git seen through. Null for other commands.
 */
const gitCommand = (words) => {
  const env = [];
  let i = 0;
  for (; i < words.length; i++) {
    if (/^[A-Za-z_]\w*=/.test(words[i])) env.push(words[i]);
    else if (!['env', 'command', 'exec', 'sudo'].includes(words[i])) break;
  }
  return words[i]?.split('/').pop() === 'git' ? { env, args: words.slice(i + 1) } : null;
};
// Husky 9 (`HUSKY=0`) and Husky 4 (`HUSKY_SKIP_HOOKS=1`) switches for skipping the git hooks.
const SKIPS_HOOKS = /^(HUSKY=0|HUSKY_SKIP_HOOKS=(1|true))$/;

/**
 * Parses options the way git does: `--long`, `--long=value`, bundled short flags (`-fu`, `-nm msg`),
 * values given to value-taking options, and `--` ending the options. Long options may be
 * abbreviated (`--no-veri`), so `has` matches any unambiguous-looking prefix.
 */
const parseOptions = (args, { short = '', long = [] } = {}) => {
  const longs = [];
  const shorts = new Set();
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [name] = arg.split('=');
      longs.push(name);
      if (!arg.includes('=') && long.some((option) => option === name)) i++;
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        shorts.add(arg[j]);
        if (short.includes(arg[j])) {
          if (j === arg.length - 1) i++; // value is the next word; otherwise it's the rest of this one
          break;
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  // `--no-v` is the shortest prefix git accepts for --no-verify; others need the full name.
  const has = (full, minLength = full.length) => longs.some((name) => name.length >= minLength && full.startsWith(name));
  return { has, shorts, positionals };
};

/** Splits `git <global options> <subcommand> <args>`. */
const splitGit = (args) => {
  const config = [];
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const [name, inline] = args[i].split(/=(.*)/s);
    if (GLOBAL_VALUE.has(name) && inline === undefined) {
      if (name === '-c' || name === '--config-env') config.push(args[i + 1] ?? '');
      i += 2;
    } else {
      if (name === '-c' || name === '--config-env') config.push(inline ?? '');
      i += 1;
    }
  }
  return { config, sub: args[i], rest: args.slice(i + 1) };
};

const deny = (reason) => ({ decision: 'deny', reason });
/** Branch names may be passed as functions, so git is only asked when a push needs them. */
const valueOf = (value) => (typeof value === 'function' ? value() : value);

const checkPush = ({ has, shorts, positionals }, branch, pushTarget, protectedBranches) => {
  if (has('--mirror', 5)) {
    return deny('`git push --mirror` overwrites every ref on the remote, protected branches included.');
  }
  if (has('--all', 4) || has('--branches', 5)) {
    return deny('`git push --all` pushes every local branch, protected ones included. Push the feature branch by name.');
  }
  const refspecs = has('--repo', 5) ? positionals : positionals.slice(1);
  if (has('--force') || shorts.has('f') || refspecs.some((spec) => spec.startsWith('+'))) {
    return deny('Plain force-push is blocked. Use --force-with-lease on your own branch, and only after the user has approved it.');
  }
  // `src:dst` pushes to dst; a bare ref pushes to the branch of that name; HEAD is the current branch.
  // With no refspec, git pushes the current branch to its push target (push.default decides).
  // `--tags` alone pushes only tags.
  const destinations = refspecs.length
    ? refspecs.map((spec) => {
        const dst = spec.includes(':') ? spec.slice(spec.lastIndexOf(':') + 1) : spec;
        return dst === 'HEAD' ? valueOf(branch) : dst.replace(/^refs\/heads\//, '');
      })
    : has('--tags')
      ? []
      : [valueOf(branch), valueOf(pushTarget)];
  const hit = destinations.find((dst) => dst && protectedBranches.includes(dst));
  return hit
    ? deny(`Never push to ${hit} directly (protected: ${protectedBranches.join(', ')}). Push a feature branch and open a merge request.`)
    : null;
};

/**
 * Returns `{ decision, reason }` for the first rule a command breaks, or null.
 * `pushTarget` is the branch a bare `git push` would update (`@{push}`), when known. `branch` and
 * `pushTarget` may be functions; they are only called for a push.
 */
export const check = (command, branch, protectedBranches = DEFAULT_PROTECTED, pushTarget = null) => {
  const commands = tokenize(command);
  if (commands.unbalanced) {
    return deny('The command has an unclosed quote, so it can\'t be checked (the shell would reject it too).');
  }
  for (const words of commands) {
    const git = gitCommand(words);
    if (!git) continue;
    const { config, sub, rest } = splitGit(git.args);

    if (config.some((entry) => /^core\.hookspath(=|$)/i.test(entry))) {
      return deny('Overriding core.hooksPath bypasses the repo\'s git hooks. Fix what the hook reported instead.');
    }
    if (!sub) continue;

    const options = parseOptions(rest, VALUE_OPTIONS[sub]);
    const bypass = options.has('--no-verify', 6) || (sub === 'commit' && options.shorts.has('n'));
    if (HOOKED.has(sub) && (bypass || git.env.some((entry) => SKIPS_HOOKS.test(entry)))) {
      return deny('Git hooks are never bypassed. Fix what the pre-commit or commit-msg hook reported instead.');
    }

    if (sub === 'push') {
      const verdict = checkPush(options, branch, pushTarget, protectedBranches);
      if (verdict) return verdict;
    }

    if (sub === 'add' && (options.has('--force', 5) || options.shorts.has('f'))) {
      if (options.positionals.some((file) => SECRET_FILE.test(file))) {
        return deny('.env files hold secrets and are ignored on purpose. Never force-add them.');
      }
      const wholeTree =
        options.has('--all', 4) ||
        options.shorts.has('A') ||
        options.positionals.some((file) => file === '.' || file === ':/' || file.endsWith('/') || /[*?[]/.test(file));
      if (wholeTree) {
        return deny('Force-adding a directory or pattern pulls in ignored files such as .env. Force-add single files by name.');
      }
    }
  }

  return null;
};

const main = () => {
  if (!optionEnabled(process.env.CLAUDE_PLUGIN_OPTION_ENABLE_GUARD)) return;

  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch (error) {
    // A guard that can't read its input must not wave the command through.
    process.stderr.write(`factory-kit guard-git: could not read the hook input (${error.message}); blocking to be safe.\n`);
    process.exitCode = 2;
    return;
  }
  const command = input?.tool_input?.command;
  if (input?.tool_name !== 'Bash' || typeof command !== 'string') return;

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR;
  const verdict = check(
    command,
    () => gitOutput(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'),
    parseBranches(process.env.CLAUDE_PLUGIN_OPTION_PROTECTED_BRANCHES),
    () => gitOutput(cwd, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{push}')?.replace(/^[^/]+\//, '')
  );
  if (!verdict) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.decision,
        permissionDecisionReason: `factory-kit guard-git: ${verdict.reason}`,
      },
    })
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`factory-kit guard-git: internal error (${error.message}); blocking to be safe.\n`);
    process.exitCode = 2;
  }
}
