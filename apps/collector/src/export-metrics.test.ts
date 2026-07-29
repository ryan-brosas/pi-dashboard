import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicMetricsSnapshot } from '@pi-tps/metrics-core';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('metrics snapshot export', () => {
  it('keeps lifetime usage by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-tps-export-'));
    temporaryRoots.push(root);
    const sessions = join(root, 'sessions');
    const output = join(root, 'metrics');
    mkdirSync(sessions);
    writeFileSync(join(sessions, 'old-session.jsonl'), [
      JSON.stringify({ type: 'session', version: 3, id: 'old-session', timestamp: '2020-01-01T00:00:00.000Z', cwd: '/project' }),
      JSON.stringify({
        type: 'message', id: 'assistant-1', parentId: null, timestamp: '2020-01-01T00:00:01.000Z',
        message: {
          role: 'assistant', provider: 'openai', model: 'gpt-test', content: [{ type: 'text', text: 'done' }],
          usage: {
            input: 10, output: 5, cacheRead: 20, cacheWrite: 0, totalTokens: 35,
            cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0, total: 0.031 },
          },
        },
      }),
    ].join('\n') + '\n');

    const result = spawnSync(
      'pnpm',
      ['--filter', 'pi-tps-relay', 'export-metrics', '--', '--out', output, '--sessions', sessions],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    const snapshot = JSON.parse(readFileSync(join(output, 'snapshot.json'), 'utf8')) as PublicMetricsSnapshot;
    expect(snapshot.sourceRecordCount).toBeGreaterThan(0);
    expect(snapshot.usage).toHaveLength(1);
    expect(snapshot.usage[0].sessionId).toHaveLength(16);
  });
});
