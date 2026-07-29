/**
 * Converts the compact public snapshot into the same UsageDashboardData
 * shape that queryUsageDashboard produces from DuckDB. This lets the
 * public Usage dashboard render without initializing DuckDB-Wasm or
 * downloading the detailed JSONL feed.
 */
import type { PublicMetricsSnapshot } from '@pi-tps/metrics-core';
import type {
  UsageDashboardData, UsageRange, UsageSummary, UsagePoint,
  UsageModelRow, UsageSessionRow, UsageScope,
} from './usageQueries';

function rangeStart(range: UsageRange): Date {
  const now = new Date();
  switch (range) {
    case '24h': return new Date(now.getTime() - 24 * 3600_000);
    case '7d': return new Date(now.getTime() - 7 * 86400_000);
    case '30d': return new Date(now.getTime() - 30 * 86400_000);
    case 'month': return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case 'all': return new Date(0);
  }
}

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function inRange(hourIso: string, start: Date): boolean {
  return new Date(hourIso) >= start;
}

function inScope(sessionId: string, scope: UsageScope): boolean {
  return !scope.sessionId || sessionId === scope.sessionId;
}

export interface SnapshotRangeCoverage {
  recordCount: number;
  latestHour: string | null;
}

export function snapshotRangeCoverage(
  snapshot: PublicMetricsSnapshot,
  range: UsageRange,
  scope: UsageScope = {},
): SnapshotRangeCoverage {
  const start = rangeStart(range);
  let recordCount = 0;
  let latestHour: string | null = null;
  for (const row of snapshot.usage) {
    if (!inRange(row.hour, start) || !inScope(row.sessionId, scope)) continue;
    recordCount += row.calls;
    if (latestHour === null || row.hour > latestHour) latestHour = row.hour;
  }
  for (const row of snapshot.activity) {
    if (!inRange(row.hour, start) || !inScope(row.sessionId, scope)) continue;
    recordCount += 1;
    if (latestHour === null || row.hour > latestHour) latestHour = row.hour;
  }
  return { recordCount, latestHour };
}

export function snapshotToUsageData(
  snapshot: PublicMetricsSnapshot,
  range: UsageRange,
  scope: UsageScope = {},
): UsageDashboardData {
  const start = rangeStart(range);
  const mStart = monthStart();

  const usage = snapshot.usage.filter((u) => inRange(u.hour, start) && inScope(u.sessionId, scope));
  const activity = snapshot.activity.filter((a) => inRange(a.hour, start) && inScope(a.sessionId, scope));

  // Summary
  const sessionIds = new Set<string>();
  let totalCalls = 0, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0;
  let cacheWriteTokens = 0, totalTokens = 0, totalCostUsd = 0;
  for (const u of usage) {
    sessionIds.add(u.sessionId);
    totalCalls += u.calls;
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
    cacheReadTokens += u.cacheReadTokens;
    cacheWriteTokens += u.cacheWriteTokens;
    totalTokens += u.totalTokens;
    totalCostUsd += u.costUsd;
  }
  let prompts = 0, swearCount = 0, humanActiveMinutes = 0, agentActiveMinutes = 0;
  for (const a of activity) {
    prompts += a.prompts;
    swearCount += a.swearCount;
    humanActiveMinutes += a.humanActiveMinutes;
    agentActiveMinutes += a.agentActiveMinutes;
  }
  const cacheHitPct = (inputTokens + cacheReadTokens) > 0
    ? 100 * cacheReadTokens / (inputTokens + cacheReadTokens) : 0;

  // Month cost
  const monthUsage = snapshot.usage.filter((u) => inRange(u.hour, mStart) && inScope(u.sessionId, scope));
  let monthCostUsd = 0;
  for (const u of monthUsage) monthCostUsd += u.costUsd;
  const now = new Date();
  const elapsedDays = Math.max(1, now.getUTCDate() - 1 + (now.getUTCHours() + now.getUTCMinutes() / 60) / 24);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const monthForecastUsd = monthCostUsd / elapsedDays * daysInMonth;

  const summary: UsageSummary = {
    totalCalls, sessions: sessionIds.size, inputTokens, outputTokens,
    cacheReadTokens, cacheWriteTokens, totalTokens, totalCostUsd,
    cacheHitPct, prompts, swearCount, humanActiveMinutes, agentActiveMinutes,
    monthCostUsd, monthForecastUsd,
  };

  // Points (time series): bucket by hour for 24h, day otherwise
  const bucketKey = (hourIso: string): string => {
    if (range === '24h') return hourIso;
    const d = new Date(hourIso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  };
  const pointMap = new Map<string, UsagePoint>();
  for (const u of usage) {
    const key = `${bucketKey(u.hour)}|${u.provider}|${u.modelId}`;
    const existing = pointMap.get(key);
    if (existing) {
      existing.calls += u.calls;
      existing.inputTokens += u.inputTokens;
      existing.outputTokens += u.outputTokens;
      existing.cacheReadTokens += u.cacheReadTokens;
      existing.cacheWriteTokens += u.cacheWriteTokens;
      existing.totalTokens += u.totalTokens;
      existing.costUsd += u.costUsd;
      existing.pricedCalls += u.pricedCalls;
    } else {
      pointMap.set(key, {
        timestamp: bucketKey(u.hour), provider: u.provider, modelId: u.modelId,
        calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens,
        totalTokens: u.totalTokens, costUsd: u.costUsd, pricedCalls: u.pricedCalls,
      });
    }
  }
  const points = [...pointMap.values()].sort((a, b) => a.timestamp < b.timestamp ? -1 : 1);

  // Models table
  const modelMap = new Map<string, UsageModelRow>();
  const modelSessionMap = new Map<string, Set<string>>();
  for (const u of usage) {
    const key = `${u.provider}|${u.modelId}`;
    const existing = modelMap.get(key);
    if (!modelSessionMap.has(key)) modelSessionMap.set(key, new Set());
    modelSessionMap.get(key)!.add(u.sessionId);
    if (existing) {
      existing.calls += u.calls;
      existing.inputTokens += u.inputTokens;
      existing.outputTokens += u.outputTokens;
      existing.cacheReadTokens += u.cacheReadTokens;
      existing.cacheWriteTokens += u.cacheWriteTokens;
      existing.totalTokens += u.totalTokens;
      existing.costUsd += u.costUsd;
      existing.pricedCalls += u.pricedCalls;
    } else {
      modelMap.set(key, {
        provider: u.provider, modelId: u.modelId, calls: u.calls,
        inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens,
        totalTokens: u.totalTokens, costUsd: u.costUsd, pricedCalls: u.pricedCalls,
        sessions: 0, cacheHitPct: 0,
      });
    }
  }
  const models = [...modelMap.entries()].map(([key, m]) => ({
    ...m, sessions: modelSessionMap.get(key)!.size,
    cacheHitPct: (m.inputTokens + m.cacheReadTokens) > 0
      ? 100 * m.cacheReadTokens / (m.inputTokens + m.cacheReadTokens) : 0,
  })).sort((a, b) => b.totalTokens - a.totalTokens);

  // Month models (same aggregation, month-scoped)
  const monthModelMap = new Map<string, UsageModelRow>();
  const monthModelSessionMap = new Map<string, Set<string>>();
  for (const u of monthUsage) {
    const key = `${u.provider}|${u.modelId}`;
    const existing = monthModelMap.get(key);
    if (!monthModelSessionMap.has(key)) monthModelSessionMap.set(key, new Set());
    monthModelSessionMap.get(key)!.add(u.sessionId);
    if (existing) {
      existing.calls += u.calls;
      existing.inputTokens += u.inputTokens;
      existing.outputTokens += u.outputTokens;
      existing.cacheReadTokens += u.cacheReadTokens;
      existing.cacheWriteTokens += u.cacheWriteTokens;
      existing.totalTokens += u.totalTokens;
      existing.costUsd += u.costUsd;
      existing.pricedCalls += u.pricedCalls;
    } else {
      monthModelMap.set(key, {
        provider: u.provider, modelId: u.modelId, calls: u.calls,
        inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens,
        totalTokens: u.totalTokens, costUsd: u.costUsd, pricedCalls: u.pricedCalls,
        sessions: 0, cacheHitPct: 0,
      });
    }
  }
  const monthModels = [...monthModelMap.entries()].map(([key, m]) => ({
    ...m, sessions: monthModelSessionMap.get(key)!.size,
    cacheHitPct: (m.inputTokens + m.cacheReadTokens) > 0
      ? 100 * m.cacheReadTokens / (m.inputTokens + m.cacheReadTokens) : 0,
  })).sort((a, b) => b.totalTokens - a.totalTokens);

  // Sessions table
  const sessionMap = new Map<string, UsageSessionRow>();
  for (const u of usage) {
    const existing = sessionMap.get(u.sessionId);
    if (existing) {
      existing.calls += u.calls;
      existing.inputTokens += u.inputTokens;
      existing.outputTokens += u.outputTokens;
      existing.cacheReadTokens += u.cacheReadTokens;
      existing.cacheWriteTokens += u.cacheWriteTokens;
      existing.totalTokens += u.totalTokens;
      existing.costUsd += u.costUsd;
      existing.pricedCalls += u.pricedCalls;
      if (u.hour < existing.firstSeen) existing.firstSeen = u.hour;
      if (u.hour > existing.lastSeen) existing.lastSeen = u.hour;
    } else {
      sessionMap.set(u.sessionId, {
        sessionId: u.sessionId, provider: u.provider, modelId: u.modelId,
        calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens,
        totalTokens: u.totalTokens, costUsd: u.costUsd, pricedCalls: u.pricedCalls,
        cacheHitPct: 0, firstSeen: u.hour, lastSeen: u.hour,
      });
    }
  }
  const sessions = [...sessionMap.values()].map((s) => ({
    ...s, cacheHitPct: (s.inputTokens + s.cacheReadTokens) > 0
      ? 100 * s.cacheReadTokens / (s.inputTokens + s.cacheReadTokens) : 0,
  })).sort((a, b) => b.lastSeen < a.lastSeen ? -1 : 1);

  return { summary, points, models, monthModels, sessions };
}
