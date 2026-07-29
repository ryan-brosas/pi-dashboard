import { describe, expect, it } from 'vitest';
import type { PricingCatalog } from '@pi-tps/metrics-core';
import type { UsageDashboardData, UsageModelRow } from './usageQueries';
import { priceUsageDashboard, resolveUsageCost } from './usagePricing';

const catalog: PricingCatalog = {
  generatedAt: '2026-07-29T00:00:00Z',
  models: [
    {
      id: 'kimi-k2.7-code', name: 'Kimi-K2.7-Code', org: 'moonshotai', provider: 'makora',
      providerDisplay: 'Makora', contextLength: 262_144, maxCompletionTokens: null,
      uptime30m: 100, discount: 0, zdr: false, subscription: false,
      pricing: { input: 0.9595, output: 3.98, cacheRead: 0.19, cacheWrite: null },
    },
    {
      id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', org: 'anthropic', provider: 'anthropic',
      providerDisplay: 'Anthropic', contextLength: 200_000, maxCompletionTokens: null,
      uptime30m: 100, discount: 0, zdr: false, subscription: false,
      pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    },
  ],
};

const makora: UsageModelRow = {
  provider: 'makora',
  modelId: 'moonshotai/Kimi-K2.7-Code',
  calls: 10,
  sessions: 2,
  inputTokens: 1_000_000,
  outputTokens: 100_000,
  cacheReadTokens: 2_000_000,
  cacheWriteTokens: 0,
  totalTokens: 3_100_000,
  cacheHitPct: 66.7,
  costUsd: 0,
  pricedCalls: 0,
};

function dashboard(models: UsageModelRow[]): UsageDashboardData {
  return {
    summary: {
      totalCalls: 10, sessions: 2, inputTokens: 1_000_000, outputTokens: 100_000,
      cacheReadTokens: 2_000_000, cacheWriteTokens: 0, totalTokens: 3_100_000,
      totalCostUsd: 0, cacheHitPct: 66.7, prompts: 0, swearCount: 0,
      humanActiveMinutes: 0, agentActiveMinutes: 0, monthCostUsd: 0, monthForecastUsd: 0,
    },
    points: [],
    models,
    monthModels: models,
    sessions: [],
  };
}

describe('usage pricing fallback', () => {
  it('prices Makora usage from its canonical TokenWatch route when native cost is absent', () => {
    const resolved = resolveUsageCost(makora, catalog);
    expect(resolved.source).toBe('catalog');
    expect(resolved.pricingModel?.id).toBe('kimi-k2.7-code');
    expect(resolved.costUsd).toBeCloseTo(1.7375);

    const priced = priceUsageDashboard(dashboard([makora]), catalog, new Date('2026-07-29T12:00:00Z'));
    expect(priced.summary.totalCostUsd).toBeCloseTo(1.7375);
    expect(priced.summary.estimatedModelCount).toBe(1);
    expect(priced.models[0].costSource).toBe('catalog');
  });

  it('prices claude-bridge usage through the Anthropic provider alias', () => {
    const bridge = { ...makora, provider: 'claude-bridge', modelId: 'claude-opus-5' };
    expect(resolveUsageCost(bridge, catalog)).toMatchObject({
      source: 'catalog',
      pricingMatchStrategy: 'provider-alias',
      canonicalProvider: 'anthropic',
      pricingModel: { id: 'anthropic/claude-opus-5', provider: 'anthropic' },
    });
  });

  it('keeps native costs instead of replacing them with catalog estimates', () => {
    const native = { ...makora, costUsd: 3.25, pricedCalls: 10 };
    expect(resolveUsageCost(native, catalog)).toMatchObject({ costUsd: 3.25, source: 'native', pricingModel: null });
  });
});
