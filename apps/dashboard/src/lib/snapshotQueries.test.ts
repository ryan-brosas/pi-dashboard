import { describe, expect, it } from 'vitest';
import type { PublicMetricsSnapshot } from '@pi-tps/metrics-core';
import { snapshotRangeCoverage, snapshotToUsageData } from './snapshotQueries';

function hour(date: Date): string {
  const value = new Date(date);
  value.setUTCMinutes(0, 0, 0);
  return value.toISOString();
}

describe('snapshot range coverage', () => {
  it('counts source records and runs inside the selected range', () => {
    const current = hour(new Date());
    const old = '2020-01-01T00:00:00.000Z';
    const snapshot: PublicMetricsSnapshot = {
      schemaVersion: 1,
      sourceRecordCount: 7,
      usage: [
        {
          hour: old, sessionId: 'old-run', provider: 'test', modelId: 'old-model', calls: 2,
          inputTokens: 2, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0,
          totalTokens: 4, costUsd: 0, pricedCalls: 0,
        },
        {
          hour: current, sessionId: 'current-run', provider: 'test', modelId: 'current-model', calls: 3,
          inputTokens: 3, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0,
          totalTokens: 6, costUsd: 0, pricedCalls: 0,
        },
      ],
      activity: [
        { hour: old, sessionId: 'old-run', prompts: 1, swearCount: 0, humanActiveMinutes: 5, agentActiveMinutes: 5 },
        { hour: current, sessionId: 'current-run', prompts: 1, swearCount: 0, humanActiveMinutes: 5, agentActiveMinutes: 5 },
      ],
    };

    expect(snapshotRangeCoverage(snapshot, 'all')).toEqual({ recordCount: 7, latestHour: current });
    expect(snapshotRangeCoverage(snapshot, '24h')).toEqual({ recordCount: 4, latestHour: current });
    expect(snapshotToUsageData(snapshot, 'all').sessions.map((session) => session.sessionId)).toEqual([
      'current-run',
      'old-run',
    ]);
    expect(snapshotToUsageData(snapshot, '24h').sessions.map((session) => session.sessionId)).toEqual([
      'current-run',
    ]);

    expect(snapshotRangeCoverage(snapshot, 'all', { sessionId: 'current-run' })).toEqual({
      recordCount: 4,
      latestHour: current,
    });
    const currentRun = snapshotToUsageData(snapshot, 'all', { sessionId: 'current-run' });
    expect(currentRun.summary.totalCalls).toBe(3);
    expect(currentRun.summary.sessions).toBe(1);
    expect(currentRun.sessions.map((session) => session.sessionId)).toEqual(['current-run']);
  });
});
