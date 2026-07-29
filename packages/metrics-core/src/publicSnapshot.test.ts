import { describe, expect, it } from 'vitest';
import { buildPublicMetricsSnapshot } from './publicSnapshot';

const usage = [
  {
    timestamp: '2026-07-28T10:05:00.000Z', sessionId: 'session-a', provider: 'openai', modelId: 'gpt-5',
    tokens: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, total: 420 },
    cost: { input: 0.1, output: 0.2, cacheRead: 0.03, cacheWrite: 0, total: 0.33 },
  },
  {
    timestamp: '2026-07-28T10:25:00.000Z', sessionId: 'session-a', provider: 'openai', modelId: 'gpt-5',
    tokens: { input: 50, output: 10, cacheRead: 0, cacheWrite: 5, total: 65 }, cost: null,
  },
  {
    timestamp: '2026-07-28T11:10:00.000Z', sessionId: 'session-b', provider: 'anthropic', modelId: 'claude',
    tokens: { input: 200, output: 40, cacheRead: 100, cacheWrite: 0, total: 340 },
    cost: { input: 0.2, output: 0.4, cacheRead: 0.01, cacheWrite: 0, total: 0.61 },
  },
];

const activity = [
  { timestamp: '2026-07-28T10:00:00.000Z', sessionId: 'session-a', prompts: 2, swearCount: 1, humanActiveMinutes: 10, agentActiveMinutes: 15 },
  { timestamp: '2026-07-28T11:00:00.000Z', sessionId: 'session-b', prompts: 1, swearCount: 0, humanActiveMinutes: 5, agentActiveMinutes: 10 },
];

describe('buildPublicMetricsSnapshot', () => {
  it('aggregates usage by UTC hour, session, provider, and model', () => {
    const snapshot = buildPublicMetricsSnapshot(usage, activity);

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.sourceRecordCount).toBe(5);
    expect(snapshot.usage).toHaveLength(2);
    expect(snapshot.usage[0]).toMatchObject({
      hour: '2026-07-28T10:00:00.000Z', sessionId: 'session-a', provider: 'openai', modelId: 'gpt-5',
      calls: 2, inputTokens: 150, outputTokens: 30, cacheReadTokens: 300,
      cacheWriteTokens: 5, totalTokens: 485, costUsd: 0.33, pricedCalls: 1,
    });
  });

  it('preserves activity totals without transcript content', () => {
    const snapshot = buildPublicMetricsSnapshot(usage, activity);

    expect(snapshot.activity).toEqual(activity.map(({ timestamp, ...row }) => ({ hour: timestamp, ...row })));
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('promptText');
    expect(serialized).not.toContain('content');
  });

  it('is deterministic regardless of input order', () => {
    expect(buildPublicMetricsSnapshot([...usage].reverse(), [...activity].reverse()))
      .toEqual(buildPublicMetricsSnapshot(usage, activity));
  });

  it('rejects invalid timestamps', () => {
    expect(() => buildPublicMetricsSnapshot([{ ...usage[0], timestamp: 'invalid' }], activity))
      .toThrow('Invalid usage timestamp');
  });
});
