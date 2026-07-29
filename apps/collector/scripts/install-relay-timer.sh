#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
USER_DIR="$HOME/.config/systemd/user"
REMOTE_HOST="${PI_TPS_METRICS_HOST:?Set PI_TPS_METRICS_HOST before installing the relay timer}"
REMOTE_ROOT="${PI_TPS_METRICS_ROOT:-/srv/pi-dashboard}"
SERVICE="$USER_DIR/pi-tps-metrics-relay.service"
TIMER="$USER_DIR/pi-tps-metrics-relay.timer"
LOGIN_USER="${USER:-$(id -un)}"
RELAY_PATH="${PI_TPS_RELAY_PATH:-$HOME/.pi/agent/bin:$HOME/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin}"
mkdir -p "$USER_DIR"

cat >"$SERVICE" <<EOF
[Unit]
Description=Publish sanitized Pi metrics to the public dashboard
StartLimitIntervalSec=1h
StartLimitBurst=4

[Service]
Type=oneshot
WorkingDirectory=$ROOT
Environment="PATH=$RELAY_PATH"
Environment="PI_TPS_METRICS_HOST=$REMOTE_HOST"
Environment="PI_TPS_METRICS_ROOT=$REMOTE_ROOT"
ExecStart=$ROOT/apps/collector/scripts/relay-metrics.sh
Nice=10
TimeoutStartSec=5m
Restart=on-failure
RestartSec=10m

[Install]
WantedBy=default.target
EOF

cat >"$TIMER" <<'EOF'
[Unit]
Description=Update the public Pi metrics dashboard hourly

[Timer]
OnCalendar=hourly
AccuracySec=1m
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
EOF

# A user timer cannot run before login unless the user manager lingers.
current="$(loginctl show-user "$LOGIN_USER" -p Linger --value 2>/dev/null || true)"
if [ "$current" != "yes" ]; then
  loginctl enable-linger "$LOGIN_USER" 2>/dev/null || true
fi
verified="$(loginctl show-user "$LOGIN_USER" -p Linger --value 2>/dev/null || true)"
if [ "$verified" != "yes" ]; then
  echo "Lingering is not enabled for $LOGIN_USER. Run 'sudo loginctl enable-linger $LOGIN_USER', then rerun this installer." >&2
  exit 1
fi

systemctl --user daemon-reload
systemctl --user enable --now pi-tps-metrics-relay.timer
systemctl --user start --no-block pi-tps-metrics-relay.service
systemctl --user show pi-tps-metrics-relay.service --property=Result --property=ExecMainStatus --no-pager
systemctl --user list-timers pi-tps-metrics-relay.timer --no-pager
