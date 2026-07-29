import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@pi-tps/metrics-core';
import type { TimelineEventRow } from '../lib/queries';
import RequestInspector from './RequestInspector';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 60,
    getVirtualItems: () => Array.from({ length: Math.min(count, 100) }, (_, index) => ({
      index,
      key: index,
      start: index * 60,
    })),
  }),
}));

function timelineRow(index: number): TimelineEventRow {
  return {
    id: `event-${index}`,
    sessionId: 'session-1',
    timestamp: '2026-07-29T00:00:00.000Z',
    type: 'tps',
    provider: 'test',
    modelId: 'test-model',
    tokensInput: 100,
    tokensOutput: 50,
    tokensCacheRead: 850,
    tokensCacheWrite: 0,
    tokensTotal: 1_000,
    ttftMs: 500,
    totalMs: 1_000,
    generationMs: 500,
    stallMs: 0,
    stallCount: 0,
    effectiveTps: 100,
    wallTps: 50,
    tps: 100,
    costTotal: null,
    energyJoules: null,
    energyCostUsd: null,
    rateUsdPerMTokens: null,
    rateUsdPerMTokensEffective: null,
    cacheRatio: 0.85,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('RequestInspector request identity', () => {
  it('keeps reused request IDs distinct across sessions', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSelect = vi.fn();
    const first = { ...timelineRow(0), sessionId: 'session-1' };
    const second = { ...timelineRow(0), sessionId: 'session-2', tokensTotal: 2_000 };
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => root.render(
      <RequestInspector
        timeline={[first, second]}
        selectedId={null}
        onSelect={onSelect}
        thresholds={DEFAULT_THRESHOLDS}
        pricingCatalog={null}
      />,
    ));

    expect(consoleError.mock.calls.some(([message]) => String(message).includes('same key'))).toBe(false);
    const secondSessionRow = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('2,000'));
    expect(secondSessionRow).toBeDefined();
    await act(async () => secondSessionRow?.click());
    expect(onSelect).toHaveBeenCalledWith('session-2:event-0');

    await act(async () => root.unmount());
  });
});

describe('RequestInspector', () => {
  it('keeps a large timeline virtualized with usable request controls', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onSelect = vi.fn();
    const timeline = Array.from({ length: 10_000 }, (_, index) => timelineRow(index));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => root.render(
      <RequestInspector
        timeline={timeline}
        selectedId={null}
        onSelect={onSelect}
        thresholds={DEFAULT_THRESHOLDS}
        pricingCatalog={null}
      />,
    ));

    const viewport = [...container.querySelectorAll<HTMLDivElement>('div')]
      .find((element) => element.style.contain === 'strict');
    expect(viewport).toBeDefined();
    expect(viewport?.parentElement?.style.height).toBe('400px');
    expect(viewport?.parentElement?.style.minHeight).toBe('400px');
    expect(viewport?.parentElement?.style.flex).toBe('0 0 auto');

    const sparkline = container.querySelector<HTMLButtonElement>('button[aria-label="Select a request from the cache hit rate chart"]');
    expect(sparkline).not.toBeNull();
    expect(sparkline?.className).toContain('h-8');
    expect([...container.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.title.includes('cache hit'))).toHaveLength(0);
    await act(async () => { sparkline?.click(); });
    expect(onSelect).toHaveBeenCalledWith('session-1:event-0');

    await act(async () => root.render(
      <RequestInspector
        timeline={timeline}
        selectedId="session-1:event-0"
        onSelect={onSelect}
        thresholds={DEFAULT_THRESHOLDS}
        pricingCatalog={null}
      />,
    ));
    expect(container.querySelector('button[aria-label="Close request detail"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
