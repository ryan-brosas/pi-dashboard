import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePricingCatalog } from './usePricingCatalog';

const modelsPayload = {
  generated_at: '2026-07-28T17:23:40.991Z',
  models: [{
    id: 'model-1',
    name: 'Model 1',
    org: 'example',
    provider: 'provider-1',
    context_length: 128_000,
    pricing: { input: 1, output: 2 },
  }],
};

const performancePayload = {
  _meta: { generated_at: '2026-07-28T17:24:16.845Z' },
  'model-1': {
    providers: {
      'provider-1': { latency: { p50: 0.4 }, throughput: { p50: 90 } },
    },
  },
};

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllGlobals();
});

describe('usePricingCatalog', () => {
  it('loads the first-party market snapshots', async () => {
    const requestedUrls: string[] = [];
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => url.endsWith('/model-performance.json') ? performancePayload : modelsPayload,
      } as Response;
    }));

    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Probe() {
      usePricingCatalog();
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    expect(requestedUrls).toEqual([
      '/data/model-market.json',
      '/data/model-performance.json',
    ]);

    await act(async () => root.unmount());
  });

  it('keeps its result stable across parent-only rerenders', async () => {
    const now = Date.now();
    const storage = new Map<string, string>([
      ['pi-tps:pricing-catalog:v1', JSON.stringify({ fetchedAt: now, payload: modelsPayload })],
      ['pi-tps:performance-catalog:v1', JSON.stringify({ fetchedAt: now, payload: performancePayload })],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).endsWith('/model-performance.json') ? performancePayload : modelsPayload,
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    const root = createRoot(container);
    let latest: ReturnType<typeof usePricingCatalog> | null = null;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Probe({ marker }: { marker: number }) {
      latest = usePricingCatalog();
      return <span>{marker}</span>;
    }

    await act(async () => {
      root.render(<Probe marker={0} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const first = latest;
    await act(async () => { root.render(<Probe marker={1} />); });

    expect(latest).toBe(first);
    await act(async () => root.unmount());
  });
});
