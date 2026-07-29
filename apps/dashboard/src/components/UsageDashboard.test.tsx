import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicMetricsSnapshot } from '@pi-tps/metrics-core';
import UsageDashboard from './UsageDashboard';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  while (roots.length > 0) await act(async () => roots.pop()?.unmount());
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function hour(date: Date): string {
  const value = new Date(date);
  value.setUTCMinutes(0, 0, 0);
  return value.toISOString();
}

function snapshotWithSessions(count: number, timestamp = new Date()): PublicMetricsSnapshot {
  const current = hour(timestamp);
  return {
    schemaVersion: 1,
    sourceRecordCount: count,
    usage: Array.from({ length: count }, (_, index) => ({
      hour: current,
      sessionId: `session-${index.toString().padStart(3, '0')}`,
      provider: 'test-provider',
      modelId: 'test-model',
      calls: 1,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 20,
      cacheWriteTokens: 0,
      totalTokens: 35,
      costUsd: 0.01,
      pricedCalls: 1,
    })),
    activity: [],
  };
}

function snapshotWithRangeGap(): PublicMetricsSnapshot {
  const current = hour(new Date());
  const stale = '2020-01-01T00:00:00.000Z';
  const row = (h: string, id: string, calls = 1) => ({
    hour: h, sessionId: id, provider: 'test-provider', modelId: 'test-model', calls,
    inputTokens: 10, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 0,
    totalTokens: 35, costUsd: 0.01, pricedCalls: 1,
  });
  return {
    schemaVersion: 1,
    sourceRecordCount: 6,
    usage: [row(current, 'current-run', 3), row(stale, 'stale-run', 1)],
    activity: [
      { hour: current, sessionId: 'current-run', prompts: 1, swearCount: 0, humanActiveMinutes: 5, agentActiveMinutes: 5 },
      { hour: stale, sessionId: 'stale-run', prompts: 1, swearCount: 0, humanActiveMinutes: 5, agentActiveMinutes: 5 },
    ],
  };
}

async function mount(
  snapshot: PublicMetricsSnapshot,
  onSessionSelect: (sessionId: string | null) => void = () => {},
  activeSessionId: string | null = null,
) {
  const container = document.createElement('div');
  const root = createRoot(container);
  roots.push(root);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => {
    root.render(
      <UsageDashboard
        dbVersion={0}
        sessionNames={new Map()}
        pricingCatalog={null}
        snapshot={snapshot}
        activeSessionId={activeSessionId}
        onSessionSelect={onSessionSelect}
      />,
    );
  });
  return container;
}

function recentRunsPanel(container: HTMLElement): HTMLElement {
  const heading = [...container.querySelectorAll('h3')]
    .find((node) => node.textContent === 'Recent runs');
  const panel = heading?.closest<HTMLElement>('.card-surface');
  if (!panel) throw new Error('Recent runs panel not found');
  return panel;
}

describe('UsageDashboard', () => {
  it('discloses the range-scoped record count and progressively reveals every run', async () => {
    const container = await mount(snapshotWithSessions(35));
    const panel = recentRunsPanel(container);

    expect(container.textContent).toContain('35 records in this range');
    expect(panel.querySelectorAll('tbody tr')).toHaveLength(30);
    expect(panel.textContent).toContain('Showing 30 of 35 runs');

    const showMore = [...panel.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Show 5 more runs'));
    expect(showMore).toBeDefined();
    await act(async () => showMore?.click());

    expect(panel.querySelectorAll('tbody tr')).toHaveLength(35);
    expect(panel.textContent).toContain('Showing all 35 runs');
    expect([...panel.querySelectorAll('button')]
      .some((button) => button.textContent?.includes('Show more'))).toBe(false);
  });

  it('narrows the disclosed record count and runs to the selected range', async () => {
    const container = await mount(snapshotWithRangeGap());
    const group = container.querySelector('[role="group"][aria-label="Usage date range"]');
    const day = [...group!.querySelectorAll('button')]
      .find((button) => button.textContent === '24h')!;

    expect(container.textContent).toContain('6 records in this range');

    await act(async () => day.click());
    expect(container.textContent).toContain('4 records in this range');
    expect(recentRunsPanel(container).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('selects a recent run from the usage table', async () => {
    const onSessionSelect = vi.fn();
    const container = await mount(snapshotWithRangeGap(), onSessionSelect);
    const run = container.querySelector<HTMLButtonElement>('[aria-label="View current-run usage"]');

    expect(run).not.toBeNull();
    await act(async () => run?.click());
    expect(onSessionSelect).toHaveBeenCalledWith('current-run');
  });

  it('renders and clears the selected run scope', async () => {
    const onSessionSelect = vi.fn();
    const container = await mount(snapshotWithRangeGap(), onSessionSelect, 'current-run');

    expect(container.textContent).toContain('Showing run current-run');
    expect(container.textContent).toContain('4 records in this range');
    expect(recentRunsPanel(container).querySelectorAll('tbody tr')).toHaveLength(1);

    const clear = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Show all runs');
    expect(clear).toBeDefined();
    await act(async () => clear?.click());
    expect(onSessionSelect).toHaveBeenCalledWith(null);
  });

  it('exposes the date range selector as a pressed-state control', async () => {
    const container = await mount(snapshotWithSessions(1));
    const group = container.querySelector('[role="group"][aria-label="Usage date range"]');
    expect(group).not.toBeNull();

    const lifetime = [...group!.querySelectorAll('button')]
      .find((button) => button.textContent === 'Lifetime');
    const day = [...group!.querySelectorAll('button')]
      .find((button) => button.textContent === '24h');
    expect(lifetime?.getAttribute('aria-pressed')).toBe('true');
    expect(day?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => day?.click());
    expect(day?.getAttribute('aria-pressed')).toBe('true');
    expect(lifetime?.getAttribute('aria-pressed')).toBe('false');
  });
});
