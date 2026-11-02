#!/usr/bin/env bash
# Runs a command while holding the machine-wide end-to-end lock.
#
#   scripts/e2e-lock.sh <command> [args...]
#
# The web and mobile end-to-end runs share the gop_e2e database and port 3101, and the Mac mini
# has room for one simulator or emulator. Two runs at once (two sessions, or a session and the
# macos-sim CI runner) would break each other, so each waits here for the one before it.
# E2E_LOCK_WAIT sets how many seconds to wait (default 1800).
set -euo pipefail

lock=/tmp/gop-e2e.lock
wait_seconds="${E2E_LOCK_WAIT:-1800}"

# Already inside a locked run, for example Playwright started from a locked script.
if [[ "${GOP_E2E_LOCKED:-}" == 1 ]]; then
  exec "$@"
fi

waited=0
until mkdir "$lock" 2>/dev/null; do
  holder="$(cat "$lock/pid" 2>/dev/null || true)"
  # A lock whose process has gone was left by a run that was killed: take it over.
  if [[ -n "$holder" ]] && ! kill -0 "$holder" 2>/dev/null; then
    rm -rf "$lock"
    continue
  fi
  if ((waited >= wait_seconds)); then
    echo "e2e-lock: still held after ${wait_seconds}s by: $(cat "$lock/what" 2>/dev/null || echo unknown)" >&2
    exit 75
  fi
  if ((waited % 60 == 0)); then
    echo "e2e-lock: waiting for another end-to-end run: $(cat "$lock/what" 2>/dev/null || echo unknown)" >&2
  fi
  sleep 5
  waited=$((waited + 5))
done
echo $$ >"$lock/pid"
echo "$* (pid $$, $(pwd), since $(date '+%H:%M:%S'))" >"$lock/what"
trap 'rm -rf "$lock"' EXIT

GOP_E2E_LOCKED=1 "$@"
