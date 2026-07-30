import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PricingModel } from '@pi-tps/metrics-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketWatch, { MarketTable } from './MarketWatch';

let duckQueryResult: { data: unknown; loading: boolean; error: unknown } = {
  data: null, loading: true, error: null,
};

vi.mock('../hooks/useDuckQuery', () => ({
  useDuckQuery: () => duckQueryResult,
}));

afterEach(() => {
  duckQueryResult = { data: null, loading: true, error: null };
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function pricingModel(index: number): PricingModel {
  return {
    id: `model-${index}`,
    name: `Model ${index}`,
    org: 'Example',
    provider: 'example',
    providerDisplay: 'Example',
    contextLength: 128_000,
    maxCompletionTokens: null,
    uptime30m: 99.9,
    discount: 0,
    zdr: false,
    subscription: false,
    pricing: { input: 1, output: 2, cacheRead: null, cacheWrite: null },
  };
}

function MarketTableHarness({ models }: { models: PricingModel[] }) {
  const [search, setSearch] = useState('');
  return (
    <MarketTable
      models={search ? models.slice(0, 5) : models}
      comparisons={[]}
      observedModels={new Set()}
      paygMode={false}
      showSavings={false}
      search={search}
      setSearch={setSearch}
      provider="all"
      setProvider={() => {}}
      providers={['example']}
      zdrOnly={false}
      setZdrOnly={() => {}}
    />
  );
}

describe('MarketWatch', () => {
  it('shows a consistent PAYG loading state while usage is pending', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(
        <MarketWatch
          dbVersion={1}
          pricing={{
            catalog: { generatedAt: new Date().toISOString(), models: [pricingModel(0)] },
            performance: null,
            fetchedAt: null,
            loading: false,
            error: null,
            refresh: vi.fn(),
          }}
        />,
      );
    });

    const modeButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === label)!;
    expect(modeButton('Market').getAttribute('aria-pressed')).toBe('true');
    expect(modeButton('PAYG Deals').getAttribute('aria-pressed')).toBe('false');

    await act(async () => modeButton('PAYG Deals').click());
    expect(modeButton('Market').getAttribute('aria-pressed')).toBe('false');
    expect(modeButton('PAYG Deals').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Actual usage · loading');

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Loading PAYG deals');
    expect(status?.hasAttribute('aria-busy')).toBe(false);
    expect(container.querySelector('table')).toBeNull();

    await act(async () => root.unmount());
  });

  it('estimates PAYG deals manually when no usage history exists', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    duckQueryResult = { data: null, loading: false, error: null };
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(
        <MarketWatch
          dbVersion={0}
          pricing={{
            catalog: { generatedAt: new Date().toISOString(), models: [pricingModel(0)] },
            performance: null, fetchedAt: null, loading: false, error: null, refresh: vi.fn(),
          }}
        />,
      );
    });

    const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.trim() === label)!;
    await act(async () => button('PAYG Deals').click());
    await act(async () => button('Manual estimate').click());

    const setInput = async (label: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await setInput('Monthly fresh input tokens', '1000000');
    await setInput('Monthly output tokens', '100000');

    expect(container.textContent).toContain('Lowest PAYG');
    expect(container.textContent).toContain('Example');
    expect(container.textContent).toContain('Manual monthly estimate');
    expect([...container.querySelectorAll('th')].map((cell) => cell.textContent?.trim())).not.toContain('Savings');

    await act(async () => root.unmount());
  });

  it('presents transparent PAYG recommendations for the observed workload', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const current = {
      ...pricingModel(0), id: 'acme/model-a', name: 'Model A', provider: 'current',
      providerDisplay: 'Current', pricing: { input: 2, output: 4, cacheRead: 1, cacheWrite: 2 },
    };
    const sameModel = {
      ...current, provider: 'switch', providerDisplay: 'Switch',
      pricing: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1 },
    };
    const cheapest = {
      ...pricingModel(1), id: 'other/model-b', provider: 'budget', providerDisplay: 'Budget',
      pricing: { input: 0.25, output: 0.5, cacheRead: 0.1, cacheWrite: 0.25 },
    };
    duckQueryResult = {
      loading: false, error: null,
      data: {
        summary: {
          totalCalls: 10, sessions: 1, inputTokens: 1_000_000, outputTokens: 100_000,
          cacheReadTokens: 2_000_000, cacheWriteTokens: 0, totalTokens: 3_100_000,
          totalCostUsd: 0, cacheHitPct: 66.7, prompts: 0, swearCount: 0,
          humanActiveMinutes: 0, agentActiveMinutes: 0, monthCostUsd: 0, monthForecastUsd: 0,
        },
        models: [{
          provider: 'current', modelId: 'acme/model-a', calls: 10, sessions: 1,
          inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 2_000_000,
          cacheWriteTokens: 0, totalTokens: 3_100_000, cacheHitPct: 66.7, costUsd: 4.4, pricedCalls: 10,
        }],
        monthModels: [], points: [], sessions: [],
      },
    };
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(
        <MarketWatch
          dbVersion={1}
          pricing={{
            catalog: { generatedAt: new Date().toISOString(), models: [current, sameModel, cheapest] },
            performance: { generatedAt: '', records: {
              'model-a|switch': { latency: { p50: 900, p75: null, p90: null, p99: null }, throughput: { p50: 80, p75: null, p90: null, p99: null } },
            } },
            fetchedAt: null, loading: false, error: null, refresh: vi.fn(),
          }}
        />,
      );
    });

    const payg = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'PAYG Deals')!;
    await act(async () => payg.click());

    expect(container.textContent).toContain('Lowest PAYG');
    expect(container.textContent).toContain('Best same-model switch');
    expect(container.textContent).toContain('Best under constraints');
    expect(container.textContent).toContain('Fastest qualifying');
    expect(container.textContent).toContain('Budget');
    expect(container.textContent).toContain('Switch');
    expect(container.textContent).toContain('80 TPS');
    expect(container.textContent).toContain('900ms');
    expect(container.textContent).toContain('Performance data: 1 of 3 qualifying routes');
    const headings = [...container.querySelectorAll('th')].map((cell) => cell.textContent?.trim());
    expect(headings).toContain('Market TPS');
    expect(headings).toContain('Latency');
    expect(headings).toContain('Savings');
    expect(container.querySelector('select[aria-label="Minimum context"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Minimum uptime"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Minimum TPS"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Maximum latency"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Stable prices only"]')).not.toBeNull();

    const sort = container.querySelector<HTMLSelectElement>('select[aria-label="Sort PAYG routes"]')!;
    expect(sort).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(sort, 'throughput');
      sort.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('tbody tr')?.textContent).toContain('Switch');

    const minTps = container.querySelector<HTMLSelectElement>('select[aria-label="Minimum TPS"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(minTps, '100');
      minTps.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('No qualifying route in the current catalog and filters.');

    await act(async () => root.unmount());
  });
});

describe('MarketTable', () => {
  it('renders catalog rows in disclosed, fixed-size pages', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const models = Array.from({ length: 205 }, (_, index) => pricingModel(index));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(<MarketTableHarness models={models} />);
    });

    expect(container.querySelectorAll('tbody tr')).toHaveLength(100);
    expect(container.textContent).toContain('Showing 1–100 of 205 routes');

    const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.trim() === label)!;
    await act(async () => { button('Next 100').click(); });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(100);
    expect(container.textContent).toContain('Showing 101–200 of 205 routes');
    await act(async () => { button('Next 5').click(); });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(container.textContent).toContain('Showing 201–205 of 205 routes');
    await act(async () => { button('Previous').click(); });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(100);
    expect(container.textContent).toContain('Showing 101–200 of 205 routes');

    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search model market"]')!;
    const setSearch = (value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, value);
      search.dispatchEvent(new Event('input', { bubbles: true }));
    };

    await act(async () => setSearch('model-2'));
    expect(container.textContent).toContain('Showing all 5 routes');

    await act(async () => setSearch(''));
    expect(container.textContent).toContain('Showing 1–100 of 205 routes');

    await act(async () => root.unmount());
  });
});
