import { describe, it, expect } from 'vitest';
import {
  hashSessionId,
  sanitizeUsageEvent,
  sanitizeTpsEvent,
  buildActivitySummary,
  validateNoForbiddenFields,
  type RelayUsageInput,
  type RelayTpsInput,
  type ActivityInput,
} from './relay';

describe('hashSessionId', () => {
  it('produces a stable 16-char hex anonymized id', () => {
    const a = hashSessionId('session-uuid-1234');
    const b = hashSessionId('session-uuid-1234');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different session ids', () => {
    expect(hashSessionId('aaa')).not.toBe(hashSessionId('bbb'));
  });
});

describe('sanitizeTpsEvent', () => {
  const base: RelayTpsInput = {
    id: 'turn-tps-1',
    sessionId: 'session-uuid-1',
    eventTimestamp: '2026-07-28T15:10:00.000Z',
    provider: 'openai',
    modelId: 'gpt-test',
    tokens: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, total: 420 },
    timing: { ttftMs: 500, totalMs: 1500, generationMs: 1000, streamMs: 900, stallMs: 100, stallCount: 1, messageCount: 2 },
    tps: 22.2,
    cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0, total: 0.0033 },
    rateUsdPerMTokens: 7.85,
    timestamp: 1785251400000,
  };

  it('emits a pi-relay-tps custom event with hashed session and all timing fields', () => {
    const out = sanitizeTpsEvent(base);
    expect(out.type).toBe('custom');
    expect(out.customType).toBe('pi-relay-tps');
    expect(out.id).toBe('turn-tps-1');
    expect(out.data.sessionId).toMatch(/^[0-9a-f]{16}$/);
    expect(out.data.tps).toBe(22.2);
    expect(out.data.timing.ttftMs).toBe(500);
    expect(out.data.timing.stallCount).toBe(1);
    expect(out.data.rateUsdPerMTokens).toBe(7.85);
    expect(out.data.timestamp).toBe(1785251400000);
  });

  it('never includes prompt, response, or content fields', () => {
    const out = sanitizeTpsEvent(base);
    const json = JSON.stringify(out);
    expect(json).not.toContain('content');
    expect(json).not.toContain('prompt');
    expect(json).not.toContain('message_content');
    expect(json).not.toContain('message_role');
  });
});

describe('sanitizeUsageEvent', () => {
  const base: RelayUsageInput = {
    id: 'turn-1',
    sessionId: 'session-uuid-1',
    timestamp: '2026-07-28T15:10:00.000Z',
    provider: 'openai',
    modelId: 'gpt-test',
    tokens: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, total: 420 },
    cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0, total: 0.0033 },
  };

  it('emits a pi-relay-usage custom event with a hashed session and no transcript', () => {
    const out = sanitizeUsageEvent(base);
    expect(out.type).toBe('custom');
    expect(out.customType).toBe('pi-relay-usage');
    expect(out.id).toBe('turn-1');
    expect(out.data.sessionId).toMatch(/^[0-9a-f]{16}$/);
    expect(out.data.model).toEqual({ provider: 'openai', modelId: 'gpt-test' });
  });

  it('never includes prompt, response, or content fields', () => {
    const out = sanitizeUsageEvent(base);
    const json = JSON.stringify(out);
    expect(json).not.toContain('content');
    expect(json).not.toContain('prompt');
    expect(json).not.toContain('message');
  });

  it('carries tokens and cost verbatim', () => {
    const out = sanitizeUsageEvent(base);
    expect(out.data.tokens).toEqual(base.tokens);
    expect(out.data.cost).toEqual(base.cost);
  });
});

describe('buildActivitySummary', () => {
  const hour = '2026-07-28T15:00:00.000Z';

  it('counts prompts and swear occurrences from activity inputs', () => {
    const inputs: ActivityInput[] = [
      { timestamp: '2026-07-28T15:01:00Z', isUserPrompt: true, swearCount: 0, humanActive: true, agentActive: false },
      { timestamp: '2026-07-28T15:02:00Z', isUserPrompt: true, swearCount: 2, humanActive: true, agentActive: false },
      { timestamp: '2026-07-28T15:03:00Z', isUserPrompt: false, swearCount: 0, humanActive: false, agentActive: true },
    ];
    const out = buildActivitySummary(hour, 'session-1', inputs);
    expect(out.type).toBe('custom');
    expect(out.customType).toBe('pi-relay-activity');
    expect(out.data.prompts).toBe(2);
    expect(out.data.swearCount).toBe(2);
  });

  it('deduplicates human-active minutes by 5-minute window', () => {
    const inputs: ActivityInput[] = [
      { timestamp: '2026-07-28T15:01:00Z', isUserPrompt: true, swearCount: 0, humanActive: true, agentActive: false },
      { timestamp: '2026-07-28T15:02:00Z', isUserPrompt: true, swearCount: 0, humanActive: true, agentActive: false },
      { timestamp: '2026-07-28T15:07:00Z', isUserPrompt: true, swearCount: 0, humanActive: true, agentActive: false },
    ];
    const out = buildActivitySummary(hour, 'session-1', inputs);
    // 15:01 and 15:02 fall in the same 5-min window (15:00-15:04); 15:07 is a new window
    // 2 distinct 5-minute windows = 10 minutes of activity
    expect(out.data.humanActiveMinutes).toBe(10);
  });

  it('uses distinct anonymous identity and IDs for each source session', () => {
    const first = buildActivitySummary(hour, 'session-1', []);
    const second = buildActivitySummary(hour, 'session-2', []);
    expect(first.data.sessionId).not.toBe(second.data.sessionId);
    expect(first.id).not.toBe(second.id);
  });

  it('emits no prompt text', () => {
    const out = buildActivitySummary(hour, 'session-1', []);
    const json = JSON.stringify(out);
    expect(json).not.toContain('content');
    expect(json).not.toContain('text');
  });
});

describe('validateNoForbiddenFields', () => {
  it('passes for a clean usage record', () => {
    expect(() => validateNoForbiddenFields({ type: 'custom', customType: 'pi-relay-usage', data: { sessionId: 'abc', tokens: {} } })).not.toThrow();
  });

  it('throws when a forbidden transcript field is present', () => {
    expect(() => validateNoForbiddenFields({ data: { message_content: 'secret prompt' } })).toThrow();
    expect(() => validateNoForbiddenFields({ data: { prompt: 'secret' } })).toThrow();
    expect(() => validateNoForbiddenFields({ content: 'secret' })).toThrow();
  });
});
