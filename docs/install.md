# Install and deploy pi-tps-web

This guide covers four independent modes:

| Mode | Runs where | Data |
| --- | --- | --- |
| Pi extension | Your workstation | Current session or all local Pi sessions |
| Standalone web app | Your workstation | JSONL files selected in the browser |
| Static VPS dashboard | A public server | Sanitized metrics only |
| Hourly relay | Your workstation plus a VPS | Sanitized metrics uploaded over SSH |

## Requirements

For the Pi extension:

- Node.js 22.19 or newer
- pi 0.74 or newer
- an internet connection during installation

A source checkout also requires Git and pnpm 11.6.0.

For a public VPS:

- a Linux server with Docker Engine and the Compose plugin
- a domain with an A or AAAA record pointing to the server
- inbound TCP ports 80 and 443
- key-based SSH access from the machine containing your Pi sessions

## Install the Pi extension

Install the package from npm:

```bash
pi install npm:@ryanjoserbrosas/pi-tps-web
```

Restart Pi or run `/reload`, then open all local history:

```text
/tps-web --history
```

The npm package includes the prepared dashboard, so the command opens without a local build. Pi lists it in the [package gallery](https://pi.dev/packages/@ryanjoserbrosas/pi-tps-web) from its published `pi-package` metadata.

To pin the repository release instead, install the Git package:

```bash
pi install https://github.com/ryan-brosas/pi-dashboard@v2.0.8
```

Pi prepares a Git install with the repository-pinned pnpm version. Later invocations reuse that build.

### Add live TPS telemetry

Normal Pi sessions already provide usage, token, and reported-cost history. TPS, TTFT, stall, and cache timing appear automatically when sessions contain compatible `tps` telemetry events. Then use:

```text
/tps-web           # current branch
/tps-web --full    # every branch in the current session
/tps-web --history # every native session on this machine
```


### Remove the extension

```bash
pi remove npm:@ryanjoserbrosas/pi-tps-web
```

Restart Pi or run `/reload` afterward.

## Install from a source checkout

Use a checkout when developing the dashboard or running the hourly relay:

```bash
git clone --branch v2.0.8 https://github.com/ryan-brosas/pi-dashboard.git
cd pi-dashboard
corepack enable
pnpm install --frozen-lockfile
pnpm build
pi install "$PWD"
```

Run the web app without Pi:

```bash
pnpm dev
```

Open the displayed loopback URL and select one or more `.jsonl` files below `~/.pi/agent/sessions`. Browser-selected files are processed locally and are not uploaded by the app.

## Export sanitized metrics

Create a public-safe feed from native Pi sessions:

```bash
pnpm export-metrics -- \
  --sessions "$HOME/.pi/agent/sessions" \
  --out "$HOME/.cache/pi-tps-web/metrics"
```

Output:

```text
metrics/
├── manifest.json
├── snapshot.json
└── hourly/YYYY-MM.jsonl
```

The exporter rejects records containing transcript fields. Session identifiers are hashed. Prompts, responses, tool payloads, and filesystem paths are not written.

Use `--retention-days N` to limit the compact snapshot window. Monthly hourly files retain the complete sanitized history.

## Deploy manually to a VPS

These commands build and export on the trusted workstation. Raw session files never leave it.

Set local deployment variables:

```bash
export VPS_SSH=dashboard@vps.example.com
export DEPLOY_ROOT=/srv/pi-dashboard
export CADDY_DOMAIN=dashboard.example.com
```

Build the static app and export the initial feed into the Compose layout:

```bash
pnpm build
pnpm export-metrics -- \
  --sessions "$HOME/.pi/agent/sessions" \
  --out apps/dashboard/metrics
```

Create a writable deployment root on the VPS. Run the `chown` command with an account that has sudo access:

```bash
ssh "$VPS_SSH" "sudo mkdir -p '$DEPLOY_ROOT' && sudo chown -R \"\$USER\":\"\$USER\" '$DEPLOY_ROOT'"
```

Upload the dashboard and server configuration:

```bash
rsync -az --delete apps/dashboard/dist/ "$VPS_SSH:$DEPLOY_ROOT/dist/"
rsync -az apps/dashboard/Caddyfile apps/dashboard/docker-compose.yml \
  "$VPS_SSH:$DEPLOY_ROOT/"
```

Publish the first metrics release behind the stable `metrics` symlink:

```bash
METRICS_VERSION=$(node -p \
  "JSON.parse(require('fs').readFileSync('apps/dashboard/metrics/manifest.json')).version")
ssh "$VPS_SSH" "mkdir -p '$DEPLOY_ROOT/metrics-releases/$METRICS_VERSION'"
rsync -az --delete apps/dashboard/metrics/ \
  "$VPS_SSH:$DEPLOY_ROOT/metrics-releases/$METRICS_VERSION/"
ssh "$VPS_SSH" "ln -sfn '$DEPLOY_ROOT/metrics-releases/$METRICS_VERSION' '$DEPLOY_ROOT/.metrics-next' && mv -Tf '$DEPLOY_ROOT/.metrics-next' '$DEPLOY_ROOT/metrics'"
```

Start Caddy:

```bash
ssh "$VPS_SSH" "cd '$DEPLOY_ROOT' && CADDY_DOMAIN='$CADDY_DOMAIN' docker compose up -d"
```

Verify HTTPS and the feed:

```bash
curl -fsS "https://$CADDY_DOMAIN/feed/manifest.json"
curl -fsS "https://$CADDY_DOMAIN/" >/dev/null
```

Caddy obtains and renews TLS certificates automatically when DNS and ports 80 and 443 are correct.

## Enable the hourly relay

Run this from the persistent source checkout on the workstation that owns the Pi sessions:

```bash
PI_TPS_METRICS_HOST="$VPS_SSH" \
PI_TPS_METRICS_ROOT="$DEPLOY_ROOT" \
./apps/collector/scripts/install-relay-timer.sh
```

The installer creates a user systemd service and hourly persistent timer. It also enables and verifies user-manager lingering so missed login sessions do not prevent scheduled runs after reboot.

Test and inspect it:

```bash
systemctl --user start pi-tps-metrics-relay.service
systemctl --user status pi-tps-metrics-relay.service
systemctl --user list-timers pi-tps-metrics-relay.timer
journalctl --user -u pi-tps-metrics-relay.service --since today
```

The relay validates locally, uploads into `metrics-releases/<version>`, atomically switches the stable `metrics` symlink, and keeps three releases. SSH and SCP operations have bounded timeouts.

## Use the GitHub Actions deployment

`.github/workflows/deploy.yml` builds and tests on pushes to `main`, uploads an atomic application release, and points `$DEPLOY_ROOT/current` at it.

Configure these GitHub Actions secrets:

| Secret | Example |
| --- | --- |
| `DEPLOY_HOST` | `vps.example.com` |
| `DEPLOY_USER` | `dashboard` |
| `DEPLOY_SSH_KEY` | private deployment key |
| `DEPLOY_KNOWN_HOSTS` | pinned `known_hosts` line for the VPS |
| `DEPLOY_DIR` | `/srv/pi-dashboard` |

Configure Compose on the VPS to follow the workflow's stable application symlink and the relay's stable metrics symlink. Create `$DEPLOY_ROOT/.env`:

```dotenv
CADDY_DOMAIN=dashboard.example.com
DEPLOY_ROOT=/srv/pi-dashboard
DASHBOARD_ROOT=/srv/pi-dashboard/current/dist
METRICS_ROOT=/srv/pi-dashboard/metrics
```

Then install the repository's Caddy files once and start Compose:

```bash
cd /srv/pi-dashboard
docker compose up -d
```

Compose mounts the deployment root once at the same path inside the container. Caddy resolves `current` and `metrics` within that live parent mount, so atomic symlink switches become visible without restarting the container. The default roots are `./dist` and `./metrics`, so the same files work for the manual layout.

## Troubleshooting

### `/tps-web` is not listed

Run `pi list`, confirm `npm:@ryanjoserbrosas/pi-tps-web` (or the Git fallback) is installed, then restart Pi or run `/reload`.

### A Git or source install build fails

From the managed Git package clone or your source checkout, run:

```bash
npx --yes pnpm@11.6.0 install --frozen-lockfile
npx --yes pnpm@11.6.0 build
```

Then reload Pi.

### History is empty

Confirm native sessions exist under `~/.pi/agent/sessions`. If Pi uses a custom session root, set `PI_CODING_AGENT_SESSION_DIR` before starting Pi.

### Usage exists but TPS or TTFT is blank

Collect new model calls with a compatible TPS telemetry source enabled. Older sessions without timing events still show normal usage and cost.

### `/feed/manifest.json` returns 404

On the VPS, verify both the symlink and container mount:

```bash
readlink -f /srv/pi-dashboard/metrics
docker compose exec caddy ls -la /srv/metrics
```

### The timer fails

Run the relay script directly from the checkout, then inspect user-service logs:

```bash
PI_TPS_METRICS_HOST="$VPS_SSH" \
PI_TPS_METRICS_ROOT="$DEPLOY_ROOT" \
./apps/collector/scripts/relay-metrics.sh
journalctl --user -u pi-tps-metrics-relay.service -n 100
```
