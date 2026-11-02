#!/bin/bash
# SessionStart hook (.claude/settings.json): gets a cloud session ready to run the repo's
# commands. It puts Node 24 on PATH, installs dependencies when the lockfile changed, and
# starts Postgres. It does nothing outside the cloud. What it prints becomes context for Claude,
# so it ends with one status line.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

status=()
log=/tmp/gop-session-start.log
: >"$log"

# Node 24 from the environment's setup script (scripts/cloud/setup.sh).
if [ -x /opt/node24/bin/node ]; then
  # corepack fetches the pnpm that package.json names; never stop to ask.
  export PATH="/opt/node24/bin:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  [ -n "${CLAUDE_ENV_FILE:-}" ] &&
    echo 'export PATH="/opt/node24/bin:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0' >>"$CLAUDE_ENV_FILE"
  status+=("node $(node --version)")
else
  status+=("Node 24 MISSING: the cloud environment has no setup script (scripts/cloud/README.md)")
fi

# Dependencies, skipped while the lockfile, the manifests and this script are unchanged.
hashes=node_modules/.session-start.sha256
inputs=(scripts/cloud/session-start.sh pnpm-lock.yaml pnpm-workspace.yaml package.json apps/*/package.json packages/*/package.json)
if sha256sum --check --status "$hashes" 2>/dev/null; then
  status+=("dependencies up to date")
else
  rm -f "$hashes"
  if CI=1 pnpm install --frozen-lockfile >>"$log" 2>&1; then
    sha256sum "${inputs[@]}" >"$hashes" || rm -f "$hashes"
    status+=("pnpm install done")
  else
    status+=("pnpm install FAILED (see $log)")
  fi
fi

# The URL CI uses. A laptop reads it from apps/api/.env, which isn't in git.
if [ -z "${DATABASE_URL:-}" ] && [ ! -f apps/api/.env ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export DATABASE_URL=postgres://gop:gop@localhost:5432/gop' >>"$CLAUDE_ENV_FILE"
fi

# Postgres for the API tests, as `pnpm db:up` starts it on a laptop. Falls back to the image's
# own PostgreSQL 16 when Docker can't run, with the same user, password and database.
start_docker_db() {
  if ! docker info >/dev/null 2>&1; then
    (dockerd >/tmp/dockerd.log 2>&1 &)
    for _ in $(seq 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  docker compose up -d --wait db
}
psql_admin() { su postgres -c "psql -tAc \"$1\""; }
start_local_db() {
  service postgresql start || return 1
  if [ "$(psql_admin "select 1 from pg_roles where rolname = 'gop'")" != 1 ]; then
    psql_admin "create role gop login createdb password 'gop'" || return 1
  fi
  if [ "$(psql_admin "select 1 from pg_database where datname = 'gop'")" != 1 ]; then
    su postgres -c "createdb -O gop gop" || return 1
  fi
}
if start_docker_db >>"$log" 2>&1; then
  status+=("Postgres 18 up in Docker")
elif start_local_db >>"$log" 2>&1; then
  status+=("Postgres up, but the image's PostgreSQL 16, not 18: Docker failed (see $log)")
else
  status+=("Postgres NOT running (see $log)")
fi

joined=$(printf '%s; ' "${status[@]}")
echo "Cloud session setup: ${joined%; }."
exit 0
