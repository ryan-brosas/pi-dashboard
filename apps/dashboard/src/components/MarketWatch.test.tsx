import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PricingModel } from '@pi-tps/metrics-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketWatch from './MarketWatch';
import { MarketTable } from './market/MarketTable';

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
      billing="all"
      setBilling={() => {}}
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

  it('uses the observed Pi fresh, cache, and output mix for subscription affordability', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    duckQueryResult = {
      loading: false, error: null,
      data: {
        summary: {
          totalCalls: 10, sessions: 1, inputTokens: 500_000, outputTokens: 100_000,
          cacheReadTokens: 9_500_000, cacheWriteTokens: 50_000_000, totalTokens: 60_100_000,
          totalCostUsd: 0, cacheHitPct: 95, prompts: 0, swearCount: 0,
          humanActiveMinutes: 0, agentActiveMinutes: 0, monthCostUsd: 0, monthForecastUsd: 0,
        },
        models: [],
        monthModels: [{
          provider: 'claude-bridge', modelId: 'claude-haiku-4.5', calls: 10, sessions: 1,
          inputTokens: 500_000, outputTokens: 100_000, cacheReadTokens: 9_500_000,
          cacheWriteTokens: 50_000_000, totalTokens: 60_100_000, cacheHitPct: 95,
          costUsd: 0, pricedCalls: 0,
        }],
        points: [], sessions: [],
      },
    };
    const haiku = {
      ...pricingModel(0), id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5',
      org: 'anthropic', provider: 'anthropic', providerDisplay: 'Anthropic',
      pricing: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    };
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(<MarketWatch dbVersion={1} pricing={{
        catalog: { generatedAt: new Date().toISOString(), models: [haiku] },
        performance: null, fetchedAt: null, loading: false, error: null, refresh: vi.fn(),
      }} />);
    });
    const subscription = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Subscription Value')!;
    await act(async () => subscription.click());

    expect(container.textContent).toContain('Your Pi history mix');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Fresh input share"]')?.value).toBe('4.95');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Cache-read share"]')?.value).toBe('94.06');
    const outputShare = container.querySelector<HTMLInputElement>('input[aria-label="Output token share"]')!;
    expect(outputShare.value).toBe('0.99');
    expect(outputShare.readOnly).toBe(true);
    expect(container.textContent).toContain('API-equivalent value');
    expect(container.textContent).toContain('$64.45');
    expect(container.textContent).toContain('3.22× realized');
    expect(container.textContent).toContain('Cache-write cost is included when published');
    expect(container.textContent).toContain('missing cache-write rate contributes $0');
    expect(container.textContent).toContain('Cache writes are excluded from the percentage mix');

    await act(async () => root.unmount());
  });

  it('searches subscription-capable routes and calculates honest subscription value', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    duckQueryResult = { data: null, loading: false, error: null };
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const subscriptionRoute = {
      ...pricingModel(0), id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', org: 'anthropic', provider: 'anthropic',
      providerDisplay: 'Anthropic', subscription: true, pricing: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    };
    const meteredRoute = {
      ...pricingModel(1), id: 'acme/metered-model', name: 'Metered Model', provider: 'metered',
      providerDisplay: 'Metered', pricing: { input: 100, output: 200, cacheRead: null, cacheWrite: null },
    };
    const makoraRoute = {
      ...pricingModel(2), id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'makora',
      providerDisplay: 'Makora', pricing: { input: 0.09, output: 0.195, cacheRead: 0.0196, cacheWrite: null },
    };
    const codexRoute = {
      ...pricingModel(3), id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', provider: 'openai',
      providerDisplay: 'OpenAI', pricing: { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0.625 },
    };

    await act(async () => {
      root.render(
        <MarketWatch
          dbVersion={0}
          pricing={{
            catalog: { generatedAt: new Date().toISOString(), models: [subscriptionRoute, meteredRoute, makoraRoute, codexRoute] },
            performance: null, fetchedAt: null, loading: false, error: null, refresh: vi.fn(),
          }}
        />,
      );
    });

    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search model market"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'subscription');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody')?.textContent).toContain('Anthropic');

    const billing = container.querySelector<HTMLSelectElement>('select[aria-label="Billing option"]')!;
    expect(billing).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(billing, 'subscription');
      billing.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.trim() === label)!;
    await act(async () => button('Subscription Value').click());
    expect(container.textContent).not.toContain('Actual usage');
    expect(container.textContent).not.toContain('Market routes');
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('input[aria-label="Monthly fresh input tokens"]')).toBeNull();

    expect(container.textContent).toContain('Subscription value');
    expect(container.querySelector('select[aria-label="Subscription plan"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Subscription reference model"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Monthly subscription price"]')?.value).toBe('20');
    const freshShare = container.querySelector<HTMLInputElement>('input[aria-label="Fresh input share"]')!;
    const cacheShare = container.querySelector<HTMLInputElement>('input[aria-label="Cache-read share"]')!;
    const outputShare = container.querySelector<HTMLInputElement>('input[aria-label="Output token share"]')!;
    expect([freshShare.value, cacheShare.value, outputShare.value]).toEqual(['2.5', '97', '0.5']);
    expect(container.textContent).toContain('TokenWatch default mix');
    expect(container.textContent).toContain('$1.00 input');
    expect(container.textContent).toContain('$0.10 cache');
    expect(container.textContent).toContain('$5.00 output');
    expect(container.textContent).toContain('$0.147');
    expect(container.textContent).toContain('136.1M');
    expect(container.textContent).toContain('3.4M fresh');
    expect(container.textContent).toContain('132M cached');
    expect(container.textContent).toContain('680.3K output');

    for (const [input, next] of [[freshShare, '3'], [cacheShare, '96']] as const) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    expect(container.textContent).toContain('$0.176');
    expect(container.textContent).toContain('113.6M');
    expect(container.textContent).toContain('Usage caps are not expressed as token allowances');

    const plan = container.querySelector<HTMLSelectElement>('select[aria-label="Subscription plan"]')!;
    expect([...plan.options].map((option) => option.textContent)).toEqual(expect.arrayContaining([
      'Makora Starter', 'Makora Developer', 'ChatGPT Pro (Codex)',
    ]));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(plan, 'makora-developer');
      plan.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Monthly subscription price"]')?.value).toBe('200');
    expect(container.textContent).toContain('$0.09 input');
    expect(container.textContent).toContain('$0.195 output');
    expect(container.textContent).toContain('Discounted overage: $0.081 input, $0.01764 cache, and $0.1755 output');
    expect(container.textContent).toContain('not applied to the base affordability comparator');
    expect(container.textContent).toContain('5,000 requests per five-hour period');
    expect(container.textContent).toContain('10% PAYG overage discount');
    expect(container.textContent).toContain('Sold out');
    const makoraConsent = container.querySelector<HTMLInputElement>('input[aria-label="Treat Makora API history as subscription usage"]')!;
    expect(makoraConsent.checked).toBe(false);
    expect(container.textContent).toContain('automatic detection is unsafe');

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(plan, 'codex-pro');
      plan.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Monthly subscription price"]')?.value).toBe('200');
    expect(container.textContent).toContain('maximum Codex tasks');
    expect(container.textContent).toContain('API-equivalent estimate');
    expect(container.textContent).toContain('GitHub Copilot');
    expect(container.textContent).toContain('Google AI');
    expect(container.textContent).toContain('not forced into token break-even');

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(plan, 'custom');
      plan.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const monthlyPrice = container.querySelector<HTMLInputElement>('input[aria-label="Monthly subscription price"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(monthlyPrice, '100');
      monthlyPrice.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('568.2M');

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
