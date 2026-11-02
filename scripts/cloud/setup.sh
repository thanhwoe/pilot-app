#!/bin/bash
# Setup script for the pilot-app cloud environment. Paste it into the environment's
# "Setup script" field at claude.ai/code; it is not run from the repo. It runs as root on
# Ubuntu 24.04 before Claude starts, and the result is cached for about seven days when it
# finishes within about five minutes.
#
# It needs Custom network access: the default list plus nodejs.org, cdn.playwright.dev and
# playwright.download.prss.microsoft.com (see scripts/cloud/README.md). Each part is optional:
# a failure is logged and the session still starts, and session-start.sh reports what's missing.
set -u

# The repo needs Node 24 (package.json engines); the image has 20, 21 and 22.
install_node() {
  local version
  version=$(curl -fsSL https://nodejs.org/dist/index.json |
    jq -r '[.[] | select(.version | startswith("v24."))][0].version') || return 1
  curl -fsSL "https://nodejs.org/dist/$version/node-$version-linux-x64.tar.xz" | tar -xJ -C /opt || return 1
  ln -sfn "/opt/node-$version-linux-x64" /opt/node24
  # pnpm comes from package.json's packageManager field, through corepack.
  PATH="/opt/node24/bin:$PATH" corepack enable --install-directory /opt/node24/bin pnpm
}

# Playwright's Chromium and its system libraries, at the version apps/web uses.
install_chromium() {
  PATH="/opt/node24/bin:$PATH" npx -y playwright@1.64.1 install --with-deps chromium
}

# Postgres 18 as in docker-compose.yml, pulled once so sessions start it without a download.
pull_postgres() {
  if ! docker info >/dev/null 2>&1; then
    dockerd >/var/log/dockerd.log 2>&1 &
    for _ in $(seq 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  docker pull postgres:18-alpine
}

install_node >/var/log/gop-node.log 2>&1 || echo "Node 24 install failed; see /var/log/gop-node.log"
install_chromium >/var/log/gop-chromium.log 2>&1 &
chromium=$!
pull_postgres >/var/log/gop-postgres.log 2>&1 &
postgres=$!
wait "$chromium" || echo "Chromium install failed; see /var/log/gop-chromium.log"
wait "$postgres" || echo "Postgres image pull failed; see /var/log/gop-postgres.log"
exit 0
