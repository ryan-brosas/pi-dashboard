# pi-tps-web

Local-first usage, cost, performance, and PAYG model-market guidance for [pi](https://github.com/earendil-works/pi). Built by [Ryan Jose Brosas](https://ryanjosebrosas.dev/).

pi-tps-web combines a browser-based TPS inspector, an all-session DuckDB dashboard, and an optional sanitized feed for a public VPS. Raw conversations stay local.

## Install

Requirements:

- Node.js 22.19 or newer
- pi 0.74 or newer
- an internet connection during package installation

Install from npm:

```bash
pi install npm:@ryanjoserbrosas/pi-tps-web
```

Restart pi or run `/reload`. The npm package includes the prepared dashboard, so `/tps-web` opens without a local build. The package is discoverable in the [Pi package gallery](https://pi.dev/packages/@ryanjoserbrosas/pi-tps-web).

To pin the repository release instead, install the Git package:

```bash
pi install https://github.com/ryan-brosas/pi-dashboard@v2.0.8
```

Live TPS and TTFT data is consumed automatically when compatible `tps` telemetry events are present. Normal Pi history, token usage, and reported cost do not require an additional extension.

See [the installation and VPS guide](docs/install.md) for source installs, sanitized exports, Docker, Caddy, the hourly relay, and GitHub Actions deployment.

## Use

| Command | Data source | Scope |
| --- | --- | --- |
| `/tps-web` | Current pi branch | Live telemetry when compatible TPS events are available |
| `/tps-web --full` | Current pi session | All branches |
| `/tps-web --history` | `~/.pi/agent/sessions` | All local sessions, including normal usage and cost records |

History mode does not require the companion extension. It binds the raw-history API only to `127.0.0.1` because native session files contain transcripts.

## Choose a PAYG route

Open **Market → PAYG Deals** to project the selected workload across pay-as-you-go provider routes. Use local history when available, or enter a manual monthly mix of fresh input, cache-read, cache-write, and output tokens. Manual values stay in the browser tab.

The shortlist keeps each tradeoff explicit instead of hiding it in a composite score:

- **Lowest PAYG** — cheapest route for the selected token mix
- **Best same-model switch** — another provider for the dominant observed model family
- **Best under constraints** — cheapest route meeting the active requirements
- **Fastest qualifying** — highest reported median TPS among qualifying routes
- **Subscription Value** — detects current-month subscription usage from local Pi history, translates fresh input, cache reads, cache writes, and output into current API-equivalent value, and compares that realized value with the monthly fee

Constrain routes by context size, uptime, TPS, latency, ZDR, provider, billing option, and stable pricing. Search recognizes subscription and metered terms. Missing measurements cannot satisfy an enabled constraint, and the dashboard reports performance-data coverage before making speed-first recommendations. Subscription Value includes sourced Claude, Makora, and ChatGPT Pro with Codex presets plus a manual fee override. Its local detector automatically aggregates only subscription-specific `claude-bridge` and `openai-codex` current-month Pi routes; Makora usage requires explicit confirmation because its provider ID can also represent PAYG. Every detected row is repriced through a current catalog route, pricing coverage is disclosed, and the dashboard reports realized value multiple and net value against the fee. The forward capacity estimate adapts TokenWatch’s budget inversion and uses the detected Pi fresh-input, cache-read, and output mix when available, otherwise TokenWatch’s 2.5% / 97% / 0.5% default; fresh and cache shares remain editable and output is the derived remainder. Cache writes count in realized value but are excluded from forward capacity because that calculation needs a separate amortization shape. Makora’s 10% overage discount is shown separately from base affordability. Opaque request windows, relative limits, and credits are never converted into fake token quotas; verify model access, throttling, and current terms first. Sort the detailed table by projected cost, TPS, latency, or uptime.

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
- PAYG route recommendations from observed usage or a manual monthly estimate, constrained by context, uptime, TPS, latency, privacy, and stable pricing
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

`pnpm test` includes distribution smokes for the source and packed npm installs. They verify package preparation, Pi discovery of `/tps-web`, and the first command opening without rebuilding.

Licensed under the [MIT License](LICENSE).
