#!/usr/bin/env bash
# Export sanitized Pi metrics and atomically publish them to the dashboard VPS.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/pi-tps-web/metrics"
REMOTE_HOST="${PI_TPS_METRICS_HOST:?Set PI_TPS_METRICS_HOST (for example, dashboard@vps.example.com)}"
REMOTE_ROOT="${PI_TPS_METRICS_ROOT:-/srv/pi-dashboard}"
SSH_TIMEOUT="${PI_TPS_SSH_TIMEOUT:-60}"
SSH_OPTIONS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=5 -o ServerAliveCountMax=3)

if [[ ! "$REMOTE_HOST" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.:-]+$ ]]; then
  echo "Invalid PI_TPS_METRICS_HOST: $REMOTE_HOST" >&2
  exit 2
fi
if [[ ! "$REMOTE_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "Invalid PI_TPS_METRICS_ROOT: $REMOTE_ROOT" >&2
  exit 2
fi
if [[ ! "$SSH_TIMEOUT" =~ ^[1-9][0-9]*[smhd]?$ ]]; then
  echo "Invalid PI_TPS_SSH_TIMEOUT: $SSH_TIMEOUT" >&2
  exit 2
fi
for command in pnpm node ssh scp tar timeout; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 2; }
done

mkdir -p "$OUT_DIR"
cd "$ROOT"
pnpm export-metrics -- --out "$OUT_DIR"

version="$(node -e "const m=require(process.argv[1]); process.stdout.write(m.version)" "$OUT_DIR/manifest.json")"
if [[ ! "$version" =~ ^[0-9a-f]{12}$ ]]; then
  echo "Invalid metrics manifest version: $version" >&2
  exit 2
fi

release="$REMOTE_ROOT/metrics-releases/$version"
if ! current="$(timeout --kill-after=5s "$SSH_TIMEOUT" ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" "readlink -f -- '$REMOTE_ROOT/metrics' 2>/dev/null || true")"; then
  echo "ssh status timed out or failed after ${SSH_TIMEOUT}s publishing $version" >&2
  exit 1
fi
if [[ "$current" == "$release" ]]; then
  echo "Metrics $version are already live."
  exit 0
fi

archive="$(mktemp "${TMPDIR:-/tmp}/pi-tps-metrics.XXXXXX.tar.gz")"
trap 'rm -f "$archive"' EXIT
tar -C "$OUT_DIR" -czf "$archive" .
remote_archive="/tmp/pi-tps-metrics-$version.tar.gz"
if ! timeout --kill-after=5s "$SSH_TIMEOUT" scp "${SSH_OPTIONS[@]}" "$archive" "$REMOTE_HOST:$remote_archive"; then
  echo "scp timed out or failed after ${SSH_TIMEOUT}s publishing $version" >&2
  exit 1
fi

if timeout --kill-after=5s "$SSH_TIMEOUT" ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" bash -s -- "$REMOTE_ROOT" "$version" "$remote_archive" <<'REMOTE'
set -Eeuo pipefail
root="$1"
version="$2"
archive="$3"
release="$root/metrics-releases/$version"
mkdir -p "$release"
tar -xzf "$archive" -C "$release"
rm -f "$archive"
ln -sfn "$release" "$root/.metrics-next"
mv -Tf "$root/.metrics-next" "$root/metrics"
cd "$root/metrics-releases"
ls -1dt -- */ 2>/dev/null | awk -v active="$version/" '$0 != active' | tail -n +3 | xargs -r rm -rf --
REMOTE
then
  echo "Published sanitized metrics $version to $REMOTE_HOST:$release"
else
  echo "ssh publish timed out or failed after ${SSH_TIMEOUT}s publishing $version" >&2
  exit 1
fi
