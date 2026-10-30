#!/usr/bin/env bash
# Runs the Maestro flows on one platform against a local API with dev sign-in codes on.
#
#   e2e/run.sh ios|android [--no-build] [flow.yaml ...]
#
# Needs `pnpm db:up`, Maestro (~/.maestro/bin) and the iOS Simulator or the Android SDK. Run one
# platform at a time: the Mac mini has room for one simulator or emulator.
set -euo pipefail

platform="${1:-}"
shift || true
case "$platform" in
  ios) api_host="localhost" ;;
  android) api_host="10.0.2.2" ;;
  *) echo "usage: e2e/run.sh ios|android [--no-build] [flow.yaml ...]" >&2; exit 2 ;;
esac
build=1
if [[ "${1:-}" == "--no-build" ]]; then
  build=0
  shift
fi

mobile_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$(cd "$mobile_dir/../.." && pwd)"
api_port=3101
api_url="http://localhost:$api_port"
database_url="${E2E_DATABASE_URL:-postgres://gop:gop@localhost:5432/gop_e2e}"
export PATH="$HOME/.maestro/bin:$PATH"

# The same database and settings as the web's Playwright run: dev codes on, never in production.
node "$repo_dir/apps/web/e2e/prepare-db.mts" "$database_url"
DATABASE_URL="$database_url" pnpm --dir "$repo_dir" --filter @gop/api db:migrate >/dev/null

# Refuse to start if anything holds the port, so the cleanup below only ever stops our own API.
if lsof -ti "tcp:$api_port" -sTCP:LISTEN >/dev/null; then
  echo "Port $api_port is already in use; stop that process first." >&2
  exit 1
fi
DATABASE_URL="$database_url" PORT="$api_port" NODE_ENV=test DEV_SIGN_IN_CODES=true \
  AUTH_SECRET="e2e-only-secret-not-for-any-real-environment" \
  pnpm --dir "$repo_dir" --filter @gop/api start >"$mobile_dir/e2e/api.log" 2>&1 &
api_pid=$!
stop_api() {
  # pnpm starts tsx, which starts node: stop whatever listens on the port, then pnpm itself.
  lsof -ti "tcp:$api_port" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  kill "$api_pid" 2>/dev/null || true
}
trap stop_api EXIT
for _ in $(seq 60); do
  curl -sf "$api_url/health" >/dev/null && break
  sleep 1
done
curl -sf "$api_url/health" >/dev/null || { echo "The API did not start; see e2e/api.log" >&2; exit 1; }

if [[ "$build" == 1 ]]; then
  cd "$mobile_dir"
  export GOP_E2E_BUILD=1 EXPO_PUBLIC_API_URL="http://$api_host:$api_port"
  if [[ "$platform" == ios ]]; then
    npx expo run:ios --configuration Release --no-bundler --device "${IOS_DEVICE:-iPhone 16}"
  else
    npx expo run:android --variant release --no-bundler --device "${ANDROID_DEVICE:-Pixel_9_API_35}"
  fi
fi

cd "$mobile_dir"
flows=("$@")
[[ ${#flows[@]} -gt 0 ]] || flows=(.maestro)
maestro --platform "$platform" test --env API_URL="$api_url" "${flows[@]}"
