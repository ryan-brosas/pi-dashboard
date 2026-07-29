import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupRelayLines } from './useRemoteMetrics';
import { buildSessionMap } from './useSessions';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function relayLine(id: string, sessionId: string, customType = 'pi-relay-usage'): string {
  return JSON.stringify({
    type: 'custom',
    customType,
    id,
    parentId: null,
    timestamp: '2026-07-28T15:00:00.000Z',
    data: {
      sessionId,
      model: { provider: 'test', modelId: 'model' },
      tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
      cost: null,
    },
  });
}

describe('relay session imports', () => {
  it('preserves each anonymous source session as a selectable session key', async () => {
    const imports = groupRelayLines([
      relayLine('a-usage', 'session-a'),
      relayLine('b-usage', 'session-b'),
      relayLine('a-tps', 'session-a', 'pi-relay-tps'),
    ].join('\n'));

    expect(imports.map((item) => item.sessionId).sort()).toEqual(['session-a', 'session-b']);

    const sessions = await buildSessionMap(imports);
    expect([...sessions.keys()].sort()).toEqual(['session-a', 'session-b']);
    expect(sessions.get('session-a')?.events.every((event) => event.sessionId === 'session-a')).toBe(true);
    expect(sessions.get('session-b')?.events.every((event) => event.sessionId === 'session-b')).toBe(true);
  });

  it('groups relay records without parsing every JSON line twice', () => {
    const raw = [
      relayLine('a-usage', 'aaaaaaaaaaaaaaaa'),
      relayLine('b-usage', 'bbbbbbbbbbbbbbbb'),
    ].join('\n');
    const parse = vi.spyOn(JSON, 'parse');

    const imports = groupRelayLines(raw);

    expect(parse).not.toHaveBeenCalled();
    expect(imports.map((item) => item.sessionId).sort()).toEqual([
      'aaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbb',
    ]);
  });

  it('yields to the browser while deriving a large session map', async () => {
    vi.stubGlobal('scheduler', undefined);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      now += 10;
      return now;
    });
    const yieldedTurn = vi.fn();
    setTimeout(yieldedTurn, 0);
    const imports = Array.from({ length: 3 }, (_, index) => ({
      raw: relayLine(`usage-${index}`, index.toString(16).padStart(16, '0')),
      sessionId: index.toString(16).padStart(16, '0'),
    }));

    await buildSessionMap(imports);

    expect(yieldedTurn).toHaveBeenCalledOnce();
  });

  it('does not starve queued browser tasks when Scheduler.yield is available', async () => {
    const priorityYield = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { yield: priorityYield });
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      now += 10;
      return now;
    });
    const queuedTurn = vi.fn();
    setTimeout(queuedTurn, 0);
    const imports = Array.from({ length: 3 }, (_, index) => ({
      raw: relayLine(`usage-${index}`, index.toString(16).padStart(16, '0')),
      sessionId: index.toString(16).padStart(16, '0'),
    }));

    await buildSessionMap(imports);

    expect(priorityYield).not.toHaveBeenCalled();
    expect(queuedTurn).toHaveBeenCalledOnce();
  });
});
