import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PricingModel } from '@pi-tps/metrics-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketWatch, { MarketTable } from './MarketWatch';

vi.mock('../hooks/useDuckQuery', () => ({
  useDuckQuery: () => ({ data: null, loading: true, error: null }),
}));

afterEach(() => {
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
      savingsMode={false}
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
  it('shows a consistent Savings loading state while usage is pending', async () => {
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
    expect(modeButton('Savings').getAttribute('aria-pressed')).toBe('false');

    await act(async () => modeButton('Savings').click());
    expect(modeButton('Market').getAttribute('aria-pressed')).toBe('false');
    expect(modeButton('Savings').getAttribute('aria-pressed')).toBe('true');

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Loading savings');
    expect(status?.hasAttribute('aria-busy')).toBe(false);
    expect(container.querySelector('table')).toBeNull();

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
