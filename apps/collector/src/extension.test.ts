import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: vi.fn((_command: string, _args: string[], callback?: (error: Error | null) => void) => {
      callback?.(null);
      return { unref() {} };
    }),
  };
});

import tpsWebExtension from './extension';

type RegisteredCommand = {
  handler: (args: string, context: ExtensionCommandContext) => Promise<void>;
};

const temporaryRoots: string[] = [];

afterEach(() => {
  delete process.env.PI_CODING_AGENT_SESSION_DIR;
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('history dashboard server', () => {
  it('serves all native sessions on loopback and closes on shutdown', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-tps-web-history-'));
    temporaryRoots.push(root);
    const project = join(root, '--project--');
    mkdirSync(project);
    writeFileSync(join(project, 'session.jsonl'), [
      JSON.stringify({ type: 'session', version: 3, id: 'session-1', timestamp: '2026-01-01T00:00:00Z', cwd: '/project' }),
      JSON.stringify({
        type: 'message', id: 'assistant-1', parentId: null, timestamp: '2026-01-01T00:00:01Z',
        message: {
          role: 'assistant', provider: 'openai', model: 'gpt-test', content: [{ type: 'text', text: 'done' }],
          usage: { input: 10, output: 5, cacheRead: 20, cacheWrite: 0, totalTokens: 35, cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0, total: 0.031 } },
        },
      }),
    ].join('\n') + '\n');
    process.env.PI_CODING_AGENT_SESSION_DIR = root;

    let command: RegisteredCommand | undefined;
    let shutdown: (() => void) | undefined;
    const notifications: string[] = [];
    const pi = {
      registerCommand(name: string, value: RegisteredCommand) {
        if (name === 'tps-web') command = value;
      },
      on(name: string, value: () => void) {
        if (name === 'session_shutdown') shutdown = value;
      },
    } as unknown as ExtensionAPI;
    tpsWebExtension(pi);

    const context = {
      sessionManager: { getEntries: () => [], getBranch: () => [] },
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionCommandContext;
    await command?.handler('--history', context);

    let dashboardUrl: string | undefined;
    for (let attempt = 0; attempt < 300 && !dashboardUrl; attempt++) {
      dashboardUrl = notifications.join('\n').match(/http:\/\/localhost:\d+/)?.[0];
      if (!dashboardUrl) await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(dashboardUrl).toBeDefined();

    const response = await fetch(`${dashboardUrl}/api/history`);
    expect(response.ok).toBe(true);
    const payload = await response.json() as { sessions: { fileName: string; raw: string }[] };
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0].fileName).toBe('--project--/session.jsonl');
    expect(payload.sessions[0].raw).toContain('assistant-1');

    shutdown?.();
  });
});
