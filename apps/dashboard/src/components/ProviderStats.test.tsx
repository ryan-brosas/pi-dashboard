import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routes = vi.hoisted(() => {
  const marketRoute = (index: number) => ({
    provider: 'market-provider',
    providerDisplay: 'Market Provider',
    modelId: `market/model-${index}`,
    modelName: `Market model ${index}`,
    contextLength: 128_000,
    uptime30m: 99.9,
    marketTps: 80 - index,
    marketTpsP75: 75 - index,
    marketTpsP90: 65 - index,
    marketTpsP99: 50 - index,
    marketTtftMs: 200 + index,
    marketTtftP75Ms: 250 + index,
    marketTtftP90Ms: 350 + index,
    marketTtftP99Ms: 500 + index,
    observed: null,
  });
  return [
    {
      provider: 'local-provider',
      providerDisplay: 'Local Provider',
      modelId: 'local/model',
      modelName: 'Local model',
      contextLength: null,
      uptime30m: null,
      marketTps: null,
      marketTpsP75: null,
      marketTpsP90: null,
      marketTpsP99: null,
      marketTtftMs: null,
      marketTtftP75Ms: null,
      marketTtftP90Ms: null,
      marketTtftP99Ms: null,
      observed: { provider: 'local-provider', avgTps: 42, maxTps: 50, avgTtftMs: 300, callCount: 7 },
    },
    ...Array.from({ length: 8 }, (_, index) => marketRoute(index)),
  ];
});

vi.mock('../lib/providerStats', () => ({
  buildProviderStatsRoutes: () => routes,
  buildProviderBenchmarkProfile: () => [],
  buildProviderChartData: () => [
    { provider: 'local-provider', providerDisplay: 'Local Provider', localTps: 42, marketTps: null, localCalls: 7, routeCount: 1 },
    { provider: 'market-provider', providerDisplay: 'Market Provider', localTps: null, marketTps: 80, localCalls: 0, routeCount: 1 },
  ],
}));

import ProviderStats from './ProviderStats';

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('ProviderStats', () => {
  it('opens observed providers and keeps market-only providers collapsed by default', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(<ProviderStats pricing={null} performance={null} observedModels={[]} loading={false} />);
    });

    const providerButtons = [...container.querySelectorAll<HTMLElement>('section > button')];
    const expandedByProvider = new Map(providerButtons.map((button) => [
      button.querySelector('h3')?.textContent?.toLowerCase(),
      button.getAttribute('aria-expanded'),
    ]));
    expect(expandedByProvider.get('local-provider')).toBe('true');
    expect(expandedByProvider.get('market-provider')).toBe('false');
    expect(container.querySelectorAll('article')).toHaveLength(1);

    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search provider performance"]')!;
    await act(async () => {
      search.value = 'market/model-7';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('section > button')?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('article')).toHaveLength(1);

    await act(async () => {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const marketButton = [...container.querySelectorAll<HTMLButtonElement>('section > button')]
      .find((button) => button.querySelector('h3')?.textContent === 'market-provider')!;
    await act(async () => { marketButton.click(); });
    expect(container.querySelectorAll('article')).toHaveLength(7);
    expect(container.textContent).toContain('Show 2 more market-provider routes');

    const showMore = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Show 2 more market-provider routes'))!;
    await act(async () => { showMore.click(); });
    expect(container.querySelectorAll('article')).toHaveLength(9);

    await act(async () => root.unmount());
  });
});
