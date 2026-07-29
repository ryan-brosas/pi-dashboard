import { describe, it, expect } from 'vitest';
import {
  ingestJsonl,
  deriveEvents,
  getTpsEvents,
} from './parser';

const VALID_TELEMETRY = JSON.stringify({
  id: 'turn-1',
  parentId: null,
  timestamp: '2025-01-01T00:00:00.000Z',
  type: 'custom',
  customType: 'tps',
  data: {
    model: { provider: 'openai', modelId: 'gpt-4o' },
    tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 },
    timing: {
      ttftMs: 2000,
      totalMs: 5000,
      generationMs: 3000,
      streamMs: null,
      stallMs: 0,
      stallCount: 0,
      messageCount: 1,
    },
    tps: 12.5,
    cost: { input: 0.001, output: 0.0015, cacheRead: 0.0001, cacheWrite: 0.00025, total: 0.00285 },
    timestamp: 1735689600000,
  },
});

const ENERGY_EVENT = JSON.stringify({
  id: 'nw-1',
  parentId: 'turn-1',
  timestamp: '2025-01-01T00:00:01.000Z',
  type: 'custom',
  customType: 'neuralwatt-energy',
  data: { energy_joules: 1234.56, cost_usd: 0.00045 },
});

describe('ingestJsonl', () => {
  it('parses structured TPS events', () => {
    const result = ingestJsonl(VALID_TELEMETRY);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('tps');
    expect(result.hasTpsEntries).toBe(true);
  });

  it('derives a session id from content', () => {
    const result = ingestJsonl(VALID_TELEMETRY);
    expect(typeof result.sessionId).toBe('string');
    expect(result.sessionId.length).toBeGreaterThan(0);
  });

  it('skips malformed lines gracefully', () => {
    const raw = VALID_TELEMETRY + '\nnot-json\n' + ENERGY_EVENT;
    const result = ingestJsonl(raw);
    expect(result.events).toHaveLength(2);
  });

  it('loads sanitized relay TPS into the normal performance path', () => {
    const raw = JSON.stringify({
      id: 'relay-tps-1',
      parentId: null,
      timestamp: '2026-07-28T15:10:00.000Z',
      type: 'custom',
      customType: 'pi-relay-tps',
      data: {
        sessionId: 'session-anon',
        model: { provider: 'openai', modelId: 'gpt-test' },
        tokens: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, total: 420 },
        timing: { ttftMs: 500, totalMs: 1500, generationMs: 1000, streamMs: 900, stallMs: 100, stallCount: 1, messageCount: 2 },
        tps: 22.2,
        cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0, total: 0.0033 },
        rateUsdPerMTokens: 7.85,
        timestamp: 1785251400000,
      },
    });

    const event = ingestJsonl(raw).events[0];
    expect(event).toMatchObject({
      type: 'tps',
      sessionId: 'session-anon',
      data: { tps: 22.2, timing: { ttftMs: 500, stallCount: 1 } },
    });
  });

  it('loads sanitized relay usage under its anonymous source session', () => {
    const raw = JSON.stringify({
      id: 'relay-usage-1',
      parentId: null,
      timestamp: '2026-07-28T15:10:00.000Z',
      type: 'custom',
      customType: 'pi-relay-usage',
      data: {
        sessionId: 'session-anon',
        model: { provider: 'openai', modelId: 'gpt-test' },
        tokens: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, total: 420 },
        cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0, total: 0.0033 },
      },
    });

    const event = ingestJsonl(raw).events[0];
    expect(event).toMatchObject({ type: 'usage', sessionId: 'session-anon', id: 'relay-usage-1' });
  });

  it('loads relay activity counts without reconstructing prompt content', () => {
    const raw = JSON.stringify({
      id: 'relay-activity-2026-07-28T15',
      parentId: null,
      timestamp: '2026-07-28T15:00:00.000Z',
      type: 'custom',
      customType: 'pi-relay-activity',
      data: {
        sessionId: 'relay-activity',
        prompts: 4,
        swearCount: 2,
        humanActiveMinutes: 10,
        agentActiveMinutes: 25,
      },
    });

    const event = ingestJsonl(raw).events[0] as unknown as { type: string; data: Record<string, unknown> };
    expect(event.type).toBe('activity');
    expect(event.data).toEqual({ prompts: 4, swearCount: 2, humanActiveMinutes: 10, agentActiveMinutes: 25 });
    expect(event.data).not.toHaveProperty('content');
  });
});

describe('deriveEvents', () => {
  it('passes through valid TPS events unchanged', () => {
    const ingest = ingestJsonl(VALID_TELEMETRY);
    const derived = deriveEvents(ingest);
    expect(derived).toHaveLength(1);
    expect(derived[0].type).toBe('tps');
    expect(getTpsEvents(derived)[0].data.model.modelId).toBe('gpt-4o');
  });

  it('retains native usage alongside structured TPS telemetry', () => {
    const message = JSON.stringify({
      id: 'assistant-1',
      parentId: 'turn-1',
      timestamp: '2025-01-01T00:00:02.000Z',
      type: 'message',
      message: {
        role: 'assistant',
        provider: 'openai',
        model: 'gpt-4o',
        content: [{ type: 'text', text: 'done' }],
        usage: {
          input: 120, output: 30, cacheRead: 80, cacheWrite: 0, totalTokens: 230,
          cost: { input: 0.001, output: 0.002, cacheRead: 0.0001, cacheWrite: 0, total: 0.0031 },
        },
      },
    });
    const derived = deriveEvents(ingestJsonl([VALID_TELEMETRY, message].join('\n')));
    const usage = derived.find((event) => event.type === 'usage');
    expect(usage?.type).toBe('usage');
    if (usage?.type !== 'usage') throw new Error('usage event missing');
    expect(usage.data.tokens.total).toBe(230);
    expect(usage.data.cost?.total).toBe(0.0031);
  });
});

describe('rateUsdPerMTokens normalization', () => {
  it('preserves the stored rateUsdPerMTokens field through ingest + derive', () => {
    const raw = JSON.stringify({
      id: 'turn-rate',
      parentId: null,
      timestamp: '2025-01-01T00:00:00.000Z',
      type: 'custom',
      customType: 'tps',
      data: {
        model: { provider: 'openai', modelId: 'gpt-4o' },
        tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 },
        timing: { ttftMs: 2000, totalMs: 5000, generationMs: 3000, streamMs: null, stallMs: 0, stallCount: 0, messageCount: 1 },
        tps: 12.5,
        cost: { input: 0.001, output: 0.0015, cacheRead: 0.0001, cacheWrite: 0.00025, total: 0.00285 },
        rateUsdPerMTokens: 4.2,
        timestamp: 1735689600000,
      },
    });
    const derived = deriveEvents(ingestJsonl(raw));
    const tps = getTpsEvents(derived)[0];
    expect(tps.data.rateUsdPerMTokens).toBe(4.2);
  });

  it('coerces absent rateUsdPerMTokens to null (older sessions)', () => {
    // VALID_TELEMETRY has no rateUsdPerMTokens field — older-session shape
    const derived = deriveEvents(ingestJsonl(VALID_TELEMETRY));
    const tps = getTpsEvents(derived)[0];
    expect(tps.data.rateUsdPerMTokens).toBeNull();
  });

  it('preserves an explicit null rateUsdPerMTokens', () => {
    const raw = VALID_TELEMETRY.replace(
      'timestamp: 1735689600000,',
      'rateUsdPerMTokens: null,\n    timestamp: 1735689600000,',
    );
    const derived = deriveEvents(ingestJsonl(raw));
    const tps = getTpsEvents(derived)[0];
    expect(tps.data.rateUsdPerMTokens).toBeNull();
  });
});
