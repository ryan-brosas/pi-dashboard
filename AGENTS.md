# Project Operating Guide

This file adds project-specific facts to the Universal Pi Operating Policy.

## Authority and scope

- The user's latest explicit instruction controls intent, scope, priorities, and trade-offs. A named waiver replaces the corresponding default only within its stated scope.
- Analysis and planning are read-only unless the user requests implementation or mutation.
- Do not require lifecycle commands or ceremony. Use the smallest useful shape: inspect, change, prove, report.

## Safety and Git hygiene

- Preserve unrelated and concurrent work. Never stash, reset, restore, rebase away, stage, commit, clean, or otherwise discard it.
- Do not delete, move, rename, empty, or discard maintained files without written authorization.
- Before irreversible Git/filesystem work or remote publication, show the exact command, cwd, branch/HEAD, affected paths, effect, rollback limits, and status. A user request naming the action and scope is sufficient authorization unless the preflight materially changes.
- Do not branch, create a worktree, commit, merge, push, deploy, publish, or change dependencies unless requested.
- Re-read owned paths immediately before editing. Stop that edit on overlapping concurrent drift.

## Editing and execution

- Read current source and nearby contracts. Prefer targeted edits; replace a whole file only when its full responsibility is being replaced.
- Edit generator sources rather than generated output. Do not create backups, duplicates, or speculative files.
- Inspect owned diffs after meaningful mutations.
- Use zero child agents by default. Add one only for concrete independent-context value.
- For precedent, search the current project and reviewed project code before inspiration sources. Treat graph results as locators; actual source and tests remain authoritative. Adapt the smallest coherent slice and verify it locally.

## Project map

- Package manager: pnpm 11.6.0 workspace. CI runs Node.js 22.
- `apps/dashboard`: React 19, Vite 8, Tailwind CSS 4, DuckDB-Wasm dashboard.
- `apps/collector`: TypeScript metrics exporter, relay scripts, and collector build.
- `packages/metrics-core`: shared metrics, relay, and snapshot contracts.
- `.pi/` is ignored private agent state. Never add or stage it.
- `node_modules/`, `dist/`, `.vite/`, `coverage/`, and generated dashboard data are outputs, not maintained source.

## Privacy and deployment boundaries

- Raw Pi session files can contain transcripts and paths. Keep raw history local; `/api/history` must not be exposed publicly.
- The public relay may publish only the sanitized contract described in `README.md` and implemented in `packages/metrics-core/src/relay.ts` and `apps/collector/src/export-metrics.ts`.
- Changes to export, relay, hosted metric loading, or deployment require explicit privacy-boundary review.
- GitHub Actions deploys from `main` through an atomic SSH/rsync release. Do not trigger or alter deployment unless requested.

## Commands

Run from the repository root unless a narrower workspace command is sufficient.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm precommit
```

Use `pnpm --filter pi-tps-relay ...` or `pnpm --filter @pi-tps/dashboard ...` for narrow package commands.

## Verification

- Name the relevant check before editing. Run it, inspect output and exit code, then cite the evidence.
- Use the narrowest relevant proof while iterating; broaden to `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build` for repository-wide consequences.
- Zero tests, skipped tests, warnings, or a nonzero exit are not a pass. Never modify tests or verification assets merely to make a check green.
- Before reporting completion, inspect the exact diff and repository status. Report failures and unverified paths plainly.
