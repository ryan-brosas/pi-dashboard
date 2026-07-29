# pi-tps-web

Usage, cost, and performance observability for [pi](https://github.com/earendil-works/pi-coding-agent). Built by [Ryan Jose Brosas](https://ryanjosebrosas.dev/).

pi-tps-web combines a browser-based TPS inspector, an all-session DuckDB dashboard, and an optional sanitized feed for a public VPS. Raw conversations stay local.

## Install

Requirements:

- Node.js 22.19 or newer
- pi 0.74 or newer
- Git and an internet connection during package installation

Install the pinned Git package:

```bash
pi install https://github.com/ryan-brosas/pi-dashboard@v2.0.2
```

Restart pi or run `/reload`. Pi's package installation prepares the web assets with the repository-pinned pnpm version, so the dashboard opens immediately.

Live TPS and TTFT data is consumed automatically when compatible `tps` telemetry events are present. Normal Pi history, token usage, and reported cost do not require an additional extension.

See [the installation and VPS guide](docs/install.md) for source installs, sanitized exports, Docker, Caddy, the hourly relay, and GitHub Actions deployment.

## Use

| Command | Data source | Scope |
| --- | --- | --- |
| `/tps-web` | Current pi branch | Live telemetry when compatible TPS events are available |
| `/tps-web --full` | Current pi session | All branches |
| `/tps-web --history` | `~/.pi/agent/sessions` | All local sessions, including normal usage and cost records |

History mode does not require the companion extension. It binds the raw-history API only to `127.0.0.1` because native session files contain transcripts.

## Run from source

```bash
git clone https://github.com/ryan-brosas/pi-dashboard.git
cd pi-dashboard
corepack enable
pnpm install --frozen-lockfile
pnpm build
pi install "$PWD"
```

Run the standalone browser app with:

```bash
pnpm dev
```

Then upload one or more Pi JSONL files from `~/.pi/agent/sessions`. Uploaded data remains in the browser.

## What it tracks

- input, output, cache-read, and cache-write tokens
- reported API-equivalent cost and monthly forecast
- TPS, TTFT, stalls, cache efficiency, and model usage when TPS telemetry is available
- calls, prompts, sessions, and model breakdowns
- human-active and agent-active minutes
- a count-only swear jar

## Public sanitized feed

The optional relay publishes only metric records:

```text
local sessions → sanitized export → SSH → VPS → public DuckDB dashboard
```

It includes model identifiers, token and cost totals, TPS, TTFT, stall and cache metrics, anonymous session IDs, and hourly activity counts. It excludes prompts, responses, tool data, paths, and transcript content.

Export once with:

```bash
pnpm export-metrics -- --out ~/.cache/pi-tps-web/metrics --sessions ~/.pi/agent/sessions
```

The output contains a content-addressed `manifest.json`, compact `snapshot.json`, and monthly files under `hourly/`. Generated feed files under `apps/dashboard/metrics` are ignored by Git.

## Privacy boundary

The relay:

- hashes session IDs with SHA-256
- preserves timing, token, and cost metrics while dropping transcript text
- counts bad words locally and exports only the number
- validates every output record against forbidden transcript fields
- never exposes `/api/history` publicly

Review `packages/metrics-core/src/relay.ts` and `apps/collector/src/export-metrics.ts` before enabling automatic uploads.

## Development

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm package:vps
```

`pnpm package:vps` creates a deterministic prebuilt VPS archive and checksum under the ignored `release/` directory.

`pnpm test` includes a clean-package smoke that verifies installation prepares the dashboard with the pinned workspace build, pi discovers `/tps-web`, and the first command opens without rebuilding.

Licensed under the [MIT License](LICENSE).
