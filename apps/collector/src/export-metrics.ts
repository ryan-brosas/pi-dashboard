/**
 * Hourly metrics relay exporter for pi-tps-web.
 *
 * Reads local Pi session JSONL, sanitizes each model call into a metric-only
 * `pi-relay-usage` record, aggregates hourly activity into a count-only
 * `pi-relay-activity` record, and writes them to `metrics/hourly/YYYY-MM.jsonl`.
 *
 * Privacy boundary: no prompt text, tool arguments, tool results, file paths,
 * or session transcripts are emitted. Session ids are SHA-256 hashed to
 * 16 hex chars. `validateNoForbiddenFields` runs on every record before write.
 *
 * Run with: npx tsx scripts/export-metrics.ts [--out <dir>] [--sessions <dir>]
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { countSwears, deriveEvents, ingestJsonl, buildPublicMetricsSnapshot } from '@pi-tps/metrics-core';
import type { TpsPayload, UsagePayload, SnapshotUsageInput, SnapshotActivityInput } from '@pi-tps/metrics-core';
import { sanitizeUsageEvent, sanitizeTpsEvent, buildActivitySummary, validateNoForbiddenFields, type ActivityInput } from '@pi-tps/metrics-core/relay';

function sessionsRoot(): string {
  if (process.env.PI_CODING_AGENT_SESSION_DIR) return resolve(process.env.PI_CODING_AGENT_SESSION_DIR);
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
  return join(agentDir, 'sessions');
}

function findSessionFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(p);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(p);
    }
  }
  return files.sort();
}

function hourKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

/** Track an activity input under month → hour → source session. */
function trackActivity(
  activityByMonth: Map<string, Map<string, Map<string, ActivityInput[]>>>,
  iso: string,
  sessionId: string,
  input: ActivityInput,
): void {
  const mk = monthKey(iso);
  const hk = hourKey(iso);
  if (!activityByMonth.has(mk)) activityByMonth.set(mk, new Map());
  const hourMap = activityByMonth.get(mk)!;
  if (!hourMap.has(hk)) hourMap.set(hk, new Map());
  const sessionMap = hourMap.get(hk)!;
  if (!sessionMap.has(sessionId)) sessionMap.set(sessionId, []);
  sessionMap.get(sessionId)!.push(input);
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function main(): void {
  const args = process.argv.slice(2);
  const outDir = flagValue(args, '--out') ?? join(process.cwd(), 'metrics');
  const sessRoot = flagValue(args, '--sessions') ?? sessionsRoot();
  const retentionDays = parseInt(flagValue(args, '--retention-days') ?? '0', 10);
  const retentionCutoff = Number.isFinite(retentionDays) && retentionDays > 0
    ? new Date(Date.now() - retentionDays * 86400_000).toISOString()
    : null;

  const files = findSessionFiles(sessRoot);
  if (files.length === 0) {
    console.error(`No session files found under ${sessRoot}`);
    process.exit(1);
  }
  console.error(`Reading ${files.length} session files from ${sessRoot}`);

  const seenUsage = new Set<string>();
  const usageByMonth = new Map<string, string[]>();
  const activityByMonth = new Map<string, Map<string, Map<string, ActivityInput[]>>>();
  const snapshotUsage: SnapshotUsageInput[] = [];
  const snapshotActivity: SnapshotActivityInput[] = [];

  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const ingest = ingestJsonl(raw);
    const derived = deriveEvents(ingest);

    for (const e of derived) {
      if (e.type === 'tps') {
        const d = (e as { data: TpsPayload }).data;
        const key = `${e.sessionId}:${e.timestamp}:${d.model.provider}:${d.model.modelId}:${d.tokens.total}:${d.tokens.output}`;
        if (seenUsage.has(key)) continue;
        seenUsage.add(key);

        const sanitized = sanitizeTpsEvent({
          id: e.id, sessionId: e.sessionId, eventTimestamp: e.timestamp,
          provider: d.model.provider, modelId: d.model.modelId,
          tokens: d.tokens, timing: d.timing, tps: d.tps, cost: d.cost,
          rateUsdPerMTokens: d.rateUsdPerMTokens ?? null, timestamp: d.timestamp,
        });
        validateNoForbiddenFields(sanitized);
        const mk = monthKey(e.timestamp);
        if (!usageByMonth.has(mk)) usageByMonth.set(mk, []);
        usageByMonth.get(mk)!.push(JSON.stringify(sanitized));
        snapshotUsage.push({ timestamp: e.timestamp, sessionId: sanitized.data.sessionId, provider: sanitized.data.model.provider, modelId: sanitized.data.model.modelId, tokens: sanitized.data.tokens, cost: sanitized.data.cost });

        // Agent-active: this timestamp had a model call
        trackActivity(activityByMonth, e.timestamp, e.sessionId, { timestamp: e.timestamp, isUserPrompt: false, swearCount: 0, humanActive: false, agentActive: true });
      } else if (e.type === 'usage') {
        const d = (e as { data: UsagePayload }).data;
        const key = `${e.sessionId}:${e.timestamp}:${d.model.provider}:${d.model.modelId}:${d.tokens.total}:${d.tokens.output}`;
        if (seenUsage.has(key)) continue;
        seenUsage.add(key);

        const sanitized = sanitizeUsageEvent({
          id: e.id, sessionId: e.sessionId, timestamp: e.timestamp,
          provider: d.model.provider, modelId: d.model.modelId,
          tokens: d.tokens, cost: d.cost,
        });
        validateNoForbiddenFields(sanitized);
        const mk = monthKey(e.timestamp);
        if (!usageByMonth.has(mk)) usageByMonth.set(mk, []);
        usageByMonth.get(mk)!.push(JSON.stringify(sanitized));
        snapshotUsage.push({ timestamp: e.timestamp, sessionId: sanitized.data.sessionId, provider: sanitized.data.model.provider, modelId: sanitized.data.model.modelId, tokens: sanitized.data.tokens, cost: sanitized.data.cost });

        // Agent-active: this timestamp had a model call
        trackActivity(activityByMonth, e.timestamp, e.sessionId, { timestamp: e.timestamp, isUserPrompt: false, swearCount: 0, humanActive: false, agentActive: true });
      } else if (e.type === 'message') {
        const d = (e as { data: { role: string; content: string; model: string | null } }).data;
        if (d.role === 'user') {
          const swears = countSwears(d.content);
          trackActivity(activityByMonth, e.timestamp, e.sessionId, { timestamp: e.timestamp, isUserPrompt: true, swearCount: swears, humanActive: true, agentActive: false });
        }
      }
    }
  }

  // Write monthly files: usage records first, then activity records per hour
  mkdirSync(join(outDir, 'hourly'), { recursive: true });
  const writtenFiles: string[] = [];
  let totalRecords = 0;

  const allMonths = new Set<string>([...usageByMonth.keys(), ...activityByMonth.keys()]);
  for (const mk of [...allMonths].sort()) {
    const lines: string[] = [];
    const usageLines = usageByMonth.get(mk) ?? [];
    lines.push(...usageLines);
    totalRecords += usageLines.length;

    const hourMap = activityByMonth.get(mk) ?? new Map<string, Map<string, ActivityInput[]>>();
    for (const [hour, sessionMap] of [...hourMap.entries()].sort()) {
      for (const [sessionId, inputs] of [...sessionMap.entries()].sort()) {
        const summary = buildActivitySummary(hour, sessionId, inputs);
        validateNoForbiddenFields(summary);
        lines.push(JSON.stringify(summary));
        totalRecords++;
        snapshotActivity.push({ timestamp: hour, sessionId: summary.data.sessionId, prompts: summary.data.prompts, swearCount: summary.data.swearCount, humanActiveMinutes: summary.data.humanActiveMinutes, agentActiveMinutes: summary.data.agentActiveMinutes });
      }
    }

    const filePath = join(outDir, 'hourly', `${mk}.jsonl`);
    writeFileSync(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
    writtenFiles.push(`hourly/${mk}.jsonl`);
  }

  // Snapshot retention is opt-in because the public Lifetime range must cover
  // the same complete sanitized history as the detailed feed.
  const snapshotUsageInWindow = retentionCutoff
    ? snapshotUsage.filter((u) => u.timestamp >= retentionCutoff!)
    : snapshotUsage;
  const snapshotActivityInWindow = retentionCutoff
    ? snapshotActivity.filter((a) => a.timestamp >= retentionCutoff!)
    : snapshotActivity;
  const snapshot = buildPublicMetricsSnapshot(snapshotUsageInWindow, snapshotActivityInWindow);
  validateNoForbiddenFields(snapshot);
  writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshot) + '\n');

  // Deterministic manifest: version is a SHA-256 hash of the emitted file
  // paths and their contents (including the snapshot) so unchanged metrics
  // produce an identical manifest and the relay no-ops. No volatile
  // timestamp is included.
  const allLines = writtenFiles.map((f) => readFileSync(join(outDir, f), 'utf8')).join('');
  const snapshotContent = readFileSync(join(outDir, 'snapshot.json'), 'utf8');
  const versionHash = createHash('sha256').update(writtenFiles.join('|') + '\n' + allLines + '\n' + snapshotContent).digest('hex').slice(0, 12);
  const manifest = {
    version: versionHash,
    files: writtenFiles,
    recordCount: totalRecords,
    snapshot: 'snapshot.json',
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.error(`Wrote ${totalRecords} records, ${snapshot.usage.length} snapshot rows across ${writtenFiles.length} files to ${outDir}`);
}

main();
