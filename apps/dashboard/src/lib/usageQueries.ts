import { runQuery, type QueryResult } from './duckdb';
import { SWEAR_PATTERN } from '@pi-tps/metrics-core';

export type UsageRange = '24h' | '7d' | '30d' | 'month' | 'all';

export interface UsageScope {
  sessionId?: string | null;
  modelId?: string | null;
}

export interface UsageSummary {
  totalCalls: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  cacheHitPct: number;
  prompts: number;
  swearCount: number;
  /** Distinct 5-minute windows with at least one user prompt. 0 when no activity rows. */
  humanActiveMinutes: number;
  /** Distinct 5-minute windows with at least one model/tool call. 0 when no activity rows. */
  agentActiveMinutes: number;
  monthCostUsd: number;
  monthForecastUsd: number;
}

export interface UsageCostBreakdown {
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  pricedCalls: number;
}

export interface UsagePoint extends UsageCostBreakdown {
  timestamp: string;
  calls: number;
}

export interface UsageModelRow extends UsageCostBreakdown {
  calls: number;
  sessions: number;
  cacheHitPct: number;
}

export interface UsageSessionRow extends UsageCostBreakdown {
  sessionId: string;
  calls: number;
  cacheHitPct: number;
  firstSeen: string;
  lastSeen: string;
}

export interface UsageDashboardData {
  summary: UsageSummary;
  points: UsagePoint[];
  models: UsageModelRow[];
  monthModels: UsageModelRow[];
  sessions: UsageSessionRow[];
}

function objects<T>(result: QueryResult): T[] {
  return result.rows.map((values) => {
    const row: Record<string, unknown> = {};
    result.columns.forEach((column, index) => { row[column] = values[index]; });
    return row as T;
  });
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function costBreakdown(row: Record<string, unknown>): UsageCostBreakdown {
  return {
    provider: String(row.provider),
    modelId: String(row.modelId),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheReadTokens: number(row.cacheReadTokens),
    cacheWriteTokens: number(row.cacheWriteTokens),
    totalTokens: number(row.totalTokens),
    costUsd: number(row.costUsd),
    pricedCalls: number(row.pricedCalls),
  };
}

export function normalizeQueryTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const magnitude = Math.abs(value);
    const milliseconds = magnitude >= 100_000_000_000_000_000
      ? value / 1_000_000
      : magnitude >= 100_000_000_000_000 ? value / 1_000 : value;
    const date = new Date(milliseconds);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return String(value ?? '');
}

function rangePredicate(range: UsageRange, column = 'event_ts'): string {
  switch (range) {
    case '24h': return `${column} >= CAST(current_timestamp AS TIMESTAMP) - INTERVAL '24 hours'`;
    case '7d': return `${column} >= CAST(current_timestamp AS TIMESTAMP) - INTERVAL '7 days'`;
    case '30d': return `${column} >= CAST(current_timestamp AS TIMESTAMP) - INTERVAL '30 days'`;
    case 'month': return `${column} >= date_trunc('month', CAST(current_timestamp AS TIMESTAMP))`;
    case 'all': return 'TRUE';
  }
}

function scopePredicate(scope: UsageScope): string {
  const conditions: string[] = [];
  if (scope.sessionId) conditions.push(`session_id = '${scope.sessionId.replace(/'/g, "''")}'`);
  if (scope.modelId) conditions.push(`model_id = '${scope.modelId.replace(/'/g, "''")}'`);
  return conditions.length > 0 ? conditions.join(' AND ') : 'TRUE';
}

function usageCte(range: UsageRange, scope: UsageScope = {}): string {
  return `
    WITH typed_usage AS (
      SELECT *,
        try_cast(timestamp AS TIMESTAMP) AS event_ts,
        row_number() OVER (
          PARTITION BY session_id, provider, model_id,
                       tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, type
          ORDER BY try_cast(timestamp AS TIMESTAMP), id
        ) AS type_rank
      FROM usage_flat
    ), ranked_usage AS (
      SELECT *,
        row_number() OVER (
          PARTITION BY session_id, provider, model_id,
                       tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, type_rank
          ORDER BY CASE WHEN cost_total > 0 THEN 0 WHEN type = 'tps' THEN 1 ELSE 2 END, id
        ) AS pair_rank
      FROM typed_usage
    ), usage AS (
      SELECT * FROM ranked_usage
      WHERE pair_rank = 1 AND ${rangePredicate(range)} AND ${scopePredicate(scope)}
    )
  `;
}

function promptCte(range: UsageRange): string {
  return `
    WITH ranked_messages AS (
      SELECT *,
        try_cast(timestamp AS TIMESTAMP) AS event_ts,
        row_number() OVER (
          PARTITION BY coalesce(id, session_id || ':' || timestamp), timestamp,
                       message_role, message_content
          ORDER BY session_id
        ) AS copy_rank
      FROM messages_flat
      WHERE message_role = 'user'
    ), prompts AS (
      SELECT * FROM ranked_messages
      WHERE copy_rank = 1 AND ${rangePredicate(range)}
    )
  `;
}

function modelAggregationSql(range: UsageRange, scope: UsageScope = {}): string {
  return `${usageCte(range, scope)}
    SELECT
      coalesce(provider, 'unknown') AS "provider",
      coalesce(model_id, 'unknown') AS "modelId",
      count(*) AS "calls",
      count(DISTINCT session_id) AS "sessions",
      coalesce(sum(tokens_input), 0) AS "inputTokens",
      coalesce(sum(tokens_output), 0) AS "outputTokens",
      coalesce(sum(tokens_cache_read), 0) AS "cacheReadTokens",
      coalesce(sum(tokens_cache_write), 0) AS "cacheWriteTokens",
      coalesce(sum(tokens_total), 0) AS "totalTokens",
      100.0 * coalesce(sum(tokens_cache_read), 0)
        / nullif(coalesce(sum(tokens_input), 0) + coalesce(sum(tokens_cache_read), 0), 0) AS "cacheHitPct",
      coalesce(sum(cost_total), 0) AS "costUsd",
      count(*) FILTER (WHERE cost_total IS NOT NULL AND cost_total > 0) AS "pricedCalls"
    FROM usage
    GROUP BY 1, 2 ORDER BY "totalTokens" DESC
  `;
}

export async function queryUsageDashboard(range: UsageRange, scope: UsageScope = {}): Promise<UsageDashboardData> {
  const summaryResult = await runQuery(`${usageCte(range, scope)}
    SELECT
      count(*) AS "totalCalls",
      count(DISTINCT session_id) AS "sessions",
      coalesce(sum(tokens_input), 0) AS "inputTokens",
      coalesce(sum(tokens_output), 0) AS "outputTokens",
      coalesce(sum(tokens_cache_read), 0) AS "cacheReadTokens",
      coalesce(sum(tokens_cache_write), 0) AS "cacheWriteTokens",
      coalesce(sum(tokens_total), 0) AS "totalTokens",
      coalesce(sum(cost_total), 0) AS "totalCostUsd"
    FROM usage
  `);
  const summaryRaw = objects<Record<string, unknown>>(summaryResult)[0] ?? {};

  const promptResult = await runQuery(`${promptCte(range)}
    SELECT
      count(*) AS "prompts",
      coalesce(sum(len(regexp_extract_all(lower(coalesce(message_content, '')), '${SWEAR_PATTERN}', 1))), 0) AS "swearCount"
    FROM prompts
  `);
  const promptRaw = objects<Record<string, unknown>>(promptResult)[0] ?? {};

  // Activity summaries from the sanitized relay exporter. These are count-only
  // hourly rows with no prompt text. COALESCE with the prompt-derived counts so
  // local history (message scans) and relay data (pre-aggregated activity) both
  // contribute without double counting: if activity rows exist for the range,
  // their counts win; otherwise the prompt scan covers local history.
  const activityResult = await runQuery(`
    WITH ranked_activity AS (
      SELECT *,
        try_cast(timestamp AS TIMESTAMP) AS event_ts,
        row_number() OVER (
          PARTITION BY coalesce(id, session_id || ':' || timestamp)
          ORDER BY session_id
        ) AS copy_rank
      FROM activity_flat
    ), activity AS (
      SELECT * FROM ranked_activity
      WHERE copy_rank = 1 AND ${rangePredicate(range)}
    )
    SELECT
      coalesce(sum(prompts), 0) AS "prompts",
      coalesce(sum(swear_count), 0) AS "swearCount",
      coalesce(sum(human_active_minutes), 0) AS "humanActiveMinutes",
      coalesce(sum(agent_active_minutes), 0) AS "agentActiveMinutes"
    FROM activity
  `);
  const activityRaw = objects<Record<string, unknown>>(activityResult)[0] ?? {};
  const hasActivity = number(activityRaw.humanActiveMinutes) > 0 || number(activityRaw.agentActiveMinutes) > 0 || number(activityRaw.prompts) > 0;

  const monthResult = await runQuery(`${usageCte('month', scope)}
    SELECT coalesce(sum(cost_total), 0) AS "monthCostUsd" FROM usage
  `);
  const monthCostUsd = number(objects<Record<string, unknown>>(monthResult)[0]?.monthCostUsd);
  const now = new Date();
  const elapsedDays = Math.max(1, now.getDate() - 1 + (now.getHours() + now.getMinutes() / 60) / 24);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthForecastUsd = monthCostUsd / elapsedDays * daysInMonth;

  const bucket = range === '24h' ? 'hour' : 'day';
  const pointsResult = await runQuery(`${usageCte(range, scope)}
    SELECT
      date_trunc('${bucket}', event_ts) AS "timestamp",
      coalesce(provider, 'unknown') AS "provider",
      coalesce(model_id, 'unknown') AS "modelId",
      count(*) AS "calls",
      coalesce(sum(tokens_input), 0) AS "inputTokens",
      coalesce(sum(tokens_output), 0) AS "outputTokens",
      coalesce(sum(tokens_cache_read), 0) AS "cacheReadTokens",
      coalesce(sum(tokens_cache_write), 0) AS "cacheWriteTokens",
      coalesce(sum(tokens_total), 0) AS "totalTokens",
      coalesce(sum(cost_total), 0) AS "costUsd",
      count(*) FILTER (WHERE cost_total IS NOT NULL AND cost_total > 0) AS "pricedCalls"
    FROM usage
    GROUP BY 1, 2, 3 ORDER BY 1
  `);

  const modelsResult = await runQuery(modelAggregationSql(range, scope));
  const monthModelsResult = await runQuery(modelAggregationSql('month', scope));

  const sessionsResult = await runQuery(`${usageCte(range, scope)}
    SELECT
      session_id AS "sessionId",
      coalesce(provider, 'unknown') AS "provider",
      coalesce(model_id, 'unknown') AS "modelId",
      count(*) AS "calls",
      coalesce(sum(tokens_input), 0) AS "inputTokens",
      coalesce(sum(tokens_output), 0) AS "outputTokens",
      coalesce(sum(tokens_cache_read), 0) AS "cacheReadTokens",
      coalesce(sum(tokens_cache_write), 0) AS "cacheWriteTokens",
      coalesce(sum(tokens_total), 0) AS "totalTokens",
      100.0 * coalesce(sum(tokens_cache_read), 0)
        / nullif(coalesce(sum(tokens_input), 0) + coalesce(sum(tokens_cache_read), 0), 0) AS "cacheHitPct",
      coalesce(sum(cost_total), 0) AS "costUsd",
      count(*) FILTER (WHERE cost_total IS NOT NULL AND cost_total > 0) AS "pricedCalls",
      min(event_ts) AS "firstSeen",
      max(event_ts) AS "lastSeen"
    FROM usage
    GROUP BY 1, 2, 3 ORDER BY "lastSeen" DESC
  `);

  const inputTokens = number(summaryRaw.inputTokens);
  const cacheReadTokens = number(summaryRaw.cacheReadTokens);
  const cacheDenominator = inputTokens + cacheReadTokens;

  return {
    summary: {
      totalCalls: number(summaryRaw.totalCalls),
      sessions: number(summaryRaw.sessions),
      inputTokens,
      outputTokens: number(summaryRaw.outputTokens),
      cacheReadTokens,
      cacheWriteTokens: number(summaryRaw.cacheWriteTokens),
      totalTokens: number(summaryRaw.totalTokens),
      totalCostUsd: number(summaryRaw.totalCostUsd),
      cacheHitPct: cacheDenominator > 0 ? 100 * cacheReadTokens / cacheDenominator : 0,
      prompts: hasActivity ? number(activityRaw.prompts) : number(promptRaw.prompts),
      swearCount: hasActivity ? number(activityRaw.swearCount) : number(promptRaw.swearCount),
      humanActiveMinutes: number(activityRaw.humanActiveMinutes),
      agentActiveMinutes: number(activityRaw.agentActiveMinutes),
      monthCostUsd,
      monthForecastUsd,
    },
    points: objects<Record<string, unknown>>(pointsResult).map((row) => ({
      ...costBreakdown(row),
      timestamp: normalizeQueryTimestamp(row.timestamp),
      calls: number(row.calls),
    })),
    models: objects<Record<string, unknown>>(modelsResult).map((row) => ({
      ...costBreakdown(row),
      calls: number(row.calls),
      sessions: number(row.sessions),
      cacheHitPct: number(row.cacheHitPct),
    })),
    monthModels: objects<Record<string, unknown>>(monthModelsResult).map((row) => ({
      ...costBreakdown(row),
      calls: number(row.calls),
      sessions: number(row.sessions),
      cacheHitPct: number(row.cacheHitPct),
    })),
    sessions: objects<Record<string, unknown>>(sessionsResult).map((row) => ({
      ...costBreakdown(row),
      sessionId: String(row.sessionId),
      calls: number(row.calls),
      cacheHitPct: number(row.cacheHitPct),
      firstSeen: normalizeQueryTimestamp(row.firstSeen),
      lastSeen: normalizeQueryTimestamp(row.lastSeen),
    })),
  };
}
