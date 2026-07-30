import { describe, expect, it } from 'vitest';
import {
  calculateSubscriptionBreakEven, calculateSubscriptionValue, compareModelPricing, comparePaygDeals, estimateModelCost, findModelPerformance, findPricingModel,
  findPricingPerformance, parsePerformanceCatalog, parsePricingCatalog, resolvePricingModel,
  type TokenUsageMix,
} from './pricing';

const usage: TokenUsageMix = {
  inputTokens: 25_000_000,
  cacheReadTokens: 970_000_000,
  cacheWriteTokens: 0,
  outputTokens: 5_000_000,
};

const catalogPayload = {
  generated_at: '2026-07-08T00:00:00.000Z',
  total: 2,
  models: [
    {
      id: 'google/gemini-test',
      name: 'Gemini Test',
      org: 'google',
      provider: 'deepinfra',
      context_length: 1_000_000,
      pricing: { input: 1.25, output: 5, cache_read: 0.31, cache_write: null },
      zdr: true,
    },
    {
      id: 'anthropic/claude-test',
      name: 'Claude Test',
      org: 'anthropic',
      provider: 'anthropic',
      context_length: 200_000,
      pricing: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
    },
  ],
};

describe('pricing catalog', () => {
  it('parses the TokenWatch models response into a typed catalog', () => {
    const result = parsePricingCatalog(catalogPayload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalog.generatedAt).toBe('2026-07-08T00:00:00.000Z');
    expect(result.catalog.models[0]).toMatchObject({
      id: 'google/gemini-test', provider: 'deepinfra', contextLength: 1_000_000, zdr: true,
    });
  });

  it('rejects malformed external responses instead of trusting unknown JSON', () => {
    expect(parsePricingCatalog({ models: [{ id: 'broken', pricing: { input: 'free' } }] })).toEqual({
      ok: false,
      error: 'Pricing catalog contains no valid models',
    });
  });

  it('applies the observed input, cache, and output mix to per-million rates', () => {
    const result = parsePricingCatalog(catalogPayload);
    if (!result.ok) throw new Error(result.error);
    const estimate = estimateModelCost(result.catalog.models[0], usage);
    expect(estimate.inputCostUsd).toBeCloseTo(31.25);
    expect(estimate.cacheReadCostUsd).toBeCloseTo(300.7);
    expect(estimate.outputCostUsd).toBeCloseTo(25);
    expect(estimate.totalCostUsd).toBeCloseTo(356.95);
    expect(estimate.blendedRateUsdPerM).toBeCloseTo(0.35695);
  });

  it('falls back to input pricing when a provider has no cache-specific rate', () => {
    const result = parsePricingCatalog({
      generated_at: '2026-07-08T00:00:00.000Z',
      models: [{ id: 'model', org: 'org', provider: 'provider', pricing: { input: 2, output: 4 } }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(estimateModelCost(result.catalog.models[0], { ...usage, cacheReadTokens: 1_000_000 }).cacheReadCostUsd).toBe(2);
  });

  it('matches provider-qualified Pi model IDs to canonical TokenWatch routes', () => {
    const models = [
      { ...catalogPayload.models[0], id: 'kimi-k2.7-code', name: 'Kimi-K2.7-Code', provider: 'makora' },
      { ...catalogPayload.models[0], id: 'glm-5.2-nvfp4', name: 'GLM-5.2-NVFP4', provider: 'makora' },
      { ...catalogPayload.models[0], id: 'kimi-k2.7-code', name: 'Kimi-K2.7-Code', provider: 'other' },
    ];
    const result = parsePricingCatalog({ generated_at: '', models });
    if (!result.ok) throw new Error(result.error);

    expect(findPricingModel(result.catalog.models, 'makora', 'moonshotai/Kimi-K2.7-Code')?.id).toBe('kimi-k2.7-code');
    expect(findPricingModel(result.catalog.models, 'MAKORA', 'zai-org/GLM-5.2-NVFP4')?.id).toBe('glm-5.2-nvfp4');
    expect(findPricingModel(result.catalog.models, 'missing', 'moonshotai/Kimi-K2.7-Code')).toBeNull();
  });

  it('resolves bridge providers through explicit families and reports match provenance', () => {
    const models = [
      { ...catalogPayload.models[0], id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', org: 'anthropic', provider: 'anthropic' },
      { ...catalogPayload.models[0], id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', org: 'anthropic', provider: 'amazon' },
    ];
    const result = parsePricingCatalog({ generated_at: '', models });
    if (!result.ok) throw new Error(result.error);

    expect(resolvePricingModel(result.catalog.models, 'claude-bridge', 'claude-opus-5')).toMatchObject({
      strategy: 'provider-alias',
      canonicalProvider: 'anthropic',
      model: { id: 'anthropic/claude-opus-5', provider: 'anthropic' },
    });
    expect(resolvePricingModel(result.catalog.models, 'custom-proxy', 'anthropic/claude-opus-5')).toMatchObject({
      strategy: 'model-family',
      canonicalProvider: 'anthropic',
    });
    expect(resolvePricingModel(result.catalog.models, 'custom-proxy', 'unrelated-model')).toBeNull();
  });

  it('parses and resolves TokenWatch performance through the shared pricing route match', () => {
    const pricing = parsePricingCatalog({
      generated_at: '',
      models: [{
        ...catalogPayload.models[1],
        id: 'anthropic/claude-opus-5',
        name: 'Claude Opus 5',
        provider: 'anthropic',
      }],
    });
    const performance = parsePerformanceCatalog({
      _meta: { generated_at: '2026-07-28T17:24:16.845Z' },
      'claude-opus-5|anthropic': {
        latency: { p50: 3737, p75: 4770.5, p90: 5681.4, p99: 9289.62 },
        throughput: { p50: 59, p75: 73, p90: 83, p99: 109 },
      },
      broken: { throughput: { p50: 'fast' } },
    });
    if (!pricing.ok) throw new Error(pricing.error);
    if (!performance.ok) throw new Error(performance.error);

    expect(performance.catalog.generatedAt).toBe('2026-07-28T17:24:16.845Z');
    expect(Object.keys(performance.catalog.records)).toEqual(['claude-opus-5|anthropic']);
    expect(findModelPerformance(performance.catalog, pricing.catalog.models[0])).toMatchObject({
      latency: { p50: 3737 },
      throughput: { p50: 59 },
    });
    expect(findPricingPerformance(
      performance.catalog,
      pricing.catalog.models,
      'claude-bridge',
      'claude-opus-5',
    )).toMatchObject({
      pricingMatch: { strategy: 'provider-alias', canonicalProvider: 'anthropic' },
      performance: {
        latency: { p50: 3737 },
        throughput: { p50: 59 },
      },
    });
    expect(findPricingPerformance(
      performance.catalog,
      pricing.catalog.models,
      'custom-proxy',
      'unknown-model',
    )).toBeNull();
  });

  it('rejects a TokenWatch performance response with no valid route records', () => {
    expect(parsePerformanceCatalog({ _meta: { generated_at: '' }, broken: true })).toEqual({
      ok: false,
      error: 'Performance catalog contains no valid route records',
    });
  });

  it('calculates subscription break-even using separate input and output prices', () => {
    const result = calculateSubscriptionBreakEven({
      monthlyPriceUsd: 20, inputRateUsdPerM: 1, outputRateUsdPerM: 5, inputShare: 0.8,
    });
    expect(result).toMatchObject({ ok: true, value: { blendedRateUsdPerM: 1.8 } });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.breakEvenTokens).toBeCloseTo(11_111_111.11, 2);
    expect(result.value.breakEvenInputTokens).toBeCloseTo(8_888_888.89, 2);
    expect(result.value.breakEvenOutputTokens).toBeCloseTo(2_222_222.22, 2);
  });

  it('prices cached input separately in subscription break-even', () => {
    const result = calculateSubscriptionBreakEven({
      monthlyPriceUsd: 20,
      inputRateUsdPerM: 1,
      cacheReadRateUsdPerM: 0.1,
      outputRateUsdPerM: 5,
      inputShare: 0.05,
      cacheReadShare: 0.94,
    });
    expect(result).toMatchObject({ ok: true, value: { blendedRateUsdPerM: 0.194 } });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.breakEvenTokens).toBeCloseTo(103_092_783.51, 2);
    expect(result.value.breakEvenCacheReadTokens).toBeCloseTo(96_907_216.49, 2);
    expect(result.value.breakEvenOutputTokens).toBeCloseTo(1_030_927.84, 2);
  });

  it('rejects token shares whose total exceeds the full mix', () => {
    expect(calculateSubscriptionBreakEven({
      monthlyPriceUsd: 20, inputRateUsdPerM: 1, cacheReadRateUsdPerM: 0.1,
      outputRateUsdPerM: 5, inputShare: 0.6, cacheReadShare: 0.5,
    })).toEqual({ ok: false, error: 'Input and cache shares must leave room for output' });
  });

  it('rejects an invalid subscription input share', () => {
    expect(calculateSubscriptionBreakEven({
      monthlyPriceUsd: 20, inputRateUsdPerM: 1, outputRateUsdPerM: 5, inputShare: 1.2,
    })).toEqual({ ok: false, error: 'Input share must be between zero and one' });
  });

  it('calculates subscription savings, value multiple, and break-even usage', () => {
    expect(calculateSubscriptionValue({
      monthlyPriceUsd: 20, paygEquivalentUsd: 50, totalTokens: 10_000_000,
    })).toEqual({
      ok: true,
      value: {
        monthlySavingsUsd: 30,
        valueMultiple: 2.5,
        breakEvenUsageMultiplier: 0.4,
        breakEvenTokens: 4_000_000,
        verdict: 'subscription-better',
      },
    });
    expect(calculateSubscriptionValue({
      monthlyPriceUsd: 20, paygEquivalentUsd: 10, totalTokens: 10_000_000,
    })).toMatchObject({
      ok: true,
      value: { monthlySavingsUsd: -10, valueMultiple: 0.5, breakEvenUsageMultiplier: 2, verdict: 'payg-better' },
    });
  });

  it('rejects subscription comparisons without a positive monthly fee', () => {
    expect(calculateSubscriptionValue({
      monthlyPriceUsd: 0, paygEquivalentUsd: 10, totalTokens: 1_000_000,
    })).toEqual({ ok: false, error: 'Subscription price must be greater than zero' });
  });

  it('includes subscription-capable routes when their metered pricing qualifies', () => {
    const pricing = parsePricingCatalog({
      generated_at: '',
      models: [
        { ...catalogPayload.models[0], provider: 'subscription-route', subscription: true, pricing: { input: 0.1, output: 0.2 } },
        { ...catalogPayload.models[0], provider: 'metered-route', pricing: { input: 0.3, output: 0.6 } },
      ],
    });
    if (!pricing.ok) throw new Error(pricing.error);

    const deals = comparePaygDeals(pricing.catalog.models, usage, null, null);

    expect(deals.map((deal) => deal.model.provider)).toEqual(['subscription-route', 'metered-route']);
  });

  it('ranks routes that satisfy explicit deal constraints', () => {
    const pricing = parsePricingCatalog({
      generated_at: '',
      models: [
        { ...catalogPayload.models[0], id: 'acme/model-a', provider: 'budget', subscription: true, pricing: { input: 0.1, output: 0.2 } },
        { ...catalogPayload.models[0], id: 'acme/model-a', provider: 'promo', discount: 0.5, uptime_30m: 99.9, pricing: { input: 0.2, output: 0.4 } },
        { ...catalogPayload.models[0], id: 'acme/model-a', provider: 'steady', discount: 0, uptime_30m: 99.95, pricing: { input: 0.3, output: 0.6 } },
        { ...catalogPayload.models[0], id: 'acme/model-a', provider: 'unknown-speed', discount: 0, uptime_30m: 99.95, pricing: { input: 0.25, output: 0.5 } },
      ],
    });
    const performance = parsePerformanceCatalog({
      'model-a|steady': { latency: { p50: 900 }, throughput: { p50: 80 } },
      'model-a|promo': { latency: { p50: 700 }, throughput: { p50: 100 } },
    });
    if (!pricing.ok) throw new Error(pricing.error);
    if (!performance.ok) throw new Error(performance.error);

    const deals = comparePaygDeals(pricing.catalog.models, usage, 500, performance.catalog, {
      stablePricingOnly: true,
      minContextLength: 200_000,
      minUptime30m: 99.9,
      minThroughputP50: 50,
      maxLatencyP50: 1_000,
    });

    expect(deals.map((deal) => deal.model.provider)).toEqual(['steady']);
    expect(deals[0].performance?.throughput?.p50).toBe(80);
  });

  it('ranks alternatives by projected cost and reports savings against observed cost', () => {
    const result = parsePricingCatalog(catalogPayload);
    if (!result.ok) throw new Error(result.error);
    const rows = compareModelPricing(result.catalog.models, usage, 500);
    expect(rows.map((row) => row.model.id)).toEqual(['google/gemini-test', 'anthropic/claude-test']);
    expect(rows[0].savingsUsd).toBeCloseTo(143.05);
    expect(rows[0].savingsPct).toBeCloseTo(28.61, 1);
  });
});
