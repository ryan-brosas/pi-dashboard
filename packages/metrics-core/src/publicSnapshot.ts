/**
 * Compact public metrics snapshot for the dashboard fast path.
 *
 * The hourly relay exports detailed per-request JSONL for on-demand DuckDB
 * analysis. This module produces a compact, pre-aggregated snapshot from
 * the same sanitized records so the public Usage dashboard can render
 * without downloading the detailed feed or initializing DuckDB-Wasm.
 *
 * Browser-safe: no Node-only imports. The exporter (Node) calls this after
 * sanitization; the dashboard (browser) consumes the resulting JSON.
 */

/** A single hourly usage aggregate row, keyed by hour/session/provider/model. */
export interface PublicSnapshotUsageRow {
  /** UTC hour boundary (ISO, minutes/seconds zeroed). */
  hour: string;
  /** SHA-256 hashed session ID (16 hex chars) — matches relay output. */
  sessionId: string;
  provider: string;
  modelId: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  /** Native cost from provider billing. 0 when no cost was reported. */
  costUsd: number;
  /** Calls where native cost was present and positive. */
  pricedCalls: number;
}

/** A single hourly activity aggregate row (count-only, no transcript). */
export interface PublicSnapshotActivityRow {
  /** UTC hour boundary (ISO, minutes/seconds zeroed). */
  hour: string;
  /** SHA-256 hashed session ID (16 hex chars). */
  sessionId: string;
  prompts: number;
  swearCount: number;
  humanActiveMinutes: number;
  agentActiveMinutes: number;
}

/** The compact snapshot served at /metrics/snapshot.json. */
export interface PublicMetricsSnapshot {
  schemaVersion: 1;
  /** Total sanitized records in the detailed JSONL feed. */
  sourceRecordCount: number;
  usage: PublicSnapshotUsageRow[];
  activity: PublicSnapshotActivityRow[];
}

/** Input shape for a sanitized usage/tps relay record. */
export interface SnapshotUsageInput {
  timestamp: string;
  sessionId: string;
  provider: string;
  modelId: string;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: { total: number } | null;
}

/** Input shape for a sanitized activity relay record. */
export interface SnapshotActivityInput {
  timestamp: string;
  sessionId: string;
  prompts: number;
  swearCount: number;
  humanActiveMinutes: number;
  agentActiveMinutes: number;
}

function hourKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid usage timestamp: ${iso}`);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function sortKey(row: { hour: string; sessionId: string; provider?: string; modelId?: string }): string {
  return `${row.hour}|${row.sessionId}|${row.provider ?? ''}|${row.modelId ?? ''}`;
}

/**
 * Build a compact, deterministic public snapshot from sanitized relay records.
 * Usage is aggregated by UTC hour, session, provider, and model so range
 * filtering and per-model pricing fallback remain accurate. Activity is
 * passed through per hour/session with transcript fields already stripped.
 */
export function buildPublicMetricsSnapshot(
  usage: SnapshotUsageInput[],
  activity: SnapshotActivityInput[],
): PublicMetricsSnapshot {
  const usageMap = new Map<string, PublicSnapshotUsageRow>();

  for (const u of usage) {
    const hour = hourKey(u.timestamp);
    const key = `${hour}|${u.sessionId}|${u.provider}|${u.modelId}`;
    const existing = usageMap.get(key);
    const costTotal = u.cost?.total ?? 0;
    const priced = u.cost != null && costTotal > 0 ? 1 : 0;

    if (existing) {
      existing.calls += 1;
      existing.inputTokens += u.tokens.input;
      existing.outputTokens += u.tokens.output;
      existing.cacheReadTokens += u.tokens.cacheRead;
      existing.cacheWriteTokens += u.tokens.cacheWrite;
      existing.totalTokens += u.tokens.total;
      existing.costUsd += costTotal;
      existing.pricedCalls += priced;
    } else {
      usageMap.set(key, {
        hour, sessionId: u.sessionId, provider: u.provider, modelId: u.modelId,
        calls: 1,
        inputTokens: u.tokens.input, outputTokens: u.tokens.output,
        cacheReadTokens: u.tokens.cacheRead, cacheWriteTokens: u.tokens.cacheWrite,
        totalTokens: u.tokens.total, costUsd: costTotal, pricedCalls: priced,
      });
    }
  }

  const usageRows = [...usageMap.values()].sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1);
  const activityRows = activity
    .map((a) => ({
      hour: hourKey(a.timestamp), sessionId: a.sessionId,
      prompts: a.prompts, swearCount: a.swearCount,
      humanActiveMinutes: a.humanActiveMinutes, agentActiveMinutes: a.agentActiveMinutes,
    }))
    .sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1);

  return {
    schemaVersion: 1,
    sourceRecordCount: usage.length + activity.length,
    usage: usageRows,
    activity: activityRows,
  };
}
