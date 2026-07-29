import { describe, expect, it } from 'vitest';
import type {
  ModelInfo, PerformanceCatalog, PricingCatalog, PricingModel,
} from '@pi-tps/metrics-core';
import {
  buildProviderBenchmarkProfile, buildProviderChartData, buildProviderStatsRoutes,
} from './providerStats.js';

function pricingModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    id: 'anthropic/claude-opus-5',
    name: 'Claude Opus 5',
    org: 'anthropic',
    provider: 'anthropic',
    providerDisplay: 'Anthropic',
    contextLength: 200_000,
    maxCompletionTokens: 8192,
    uptime30m: 99.9,
    discount: 0,
    zdr: false,
    subscription: false,
    pricing: { input: 5, output: 25, cacheRead: 0.3, cacheWrite: 3.75 },
    ...overrides,
  };
}

function observed(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    modelId: 'claude-opus-5',
    provider: 'claude-bridge',
    callCount: 100,
    totalTokens: 500_000,
    avgTps: 530.6,
    maxTps: 13663,
    avgTtftMs: 4400,
    energyCostUsd: null,
    energyJoules: null,
    blendedCostUsd: 326.82,
    costSource: 'tps',
    ...overrides,
  };
}

const performance: PerformanceCatalog = {
  generatedAt: '2026-07-28T17:24:16.845Z',
  records: {
    'claude-opus-5|anthropic': {
      latency: { p50: 3737, p75: 4770, p90: 5681, p99: 9290 },
      throughput: { p50: 59, p75: 73, p90: 83, p99: 109 },
    },
    'qwen3.7-flash|alibaba': {
      latency: { p50: 1018, p75: 1789, p90: 4632, p99: 23728 },
      throughput: { p50: 91, p75: 127, p90: 144, p99: 184 },
    },
  },
};

const catalog: PricingCatalog = {
  generatedAt: '',
  models: [
    pricingModel(),
    pricingModel({
      id: 'qwen/qwen3.7-flash', name: 'Qwen 3.7 Flash', org: 'qwen',
      provider: 'alibaba', providerDisplay: 'Alibaba', uptime30m: 100,
    }),
    pricingModel({ id: 'no-performance', name: 'No performance', provider: 'other' }),
  ],
};

describe('provider stats routes', () => {
  it('includes market routes that have never been observed locally', () => {
    const rows = buildProviderStatsRoutes(catalog, performance, []);
    expect(rows.map((row) => `${row.provider}:${row.modelId}`)).toEqual([
      'alibaba:qwen/qwen3.7-flash',
      'anthropic:anthropic/claude-opus-5',
    ]);
    expect(rows[0]).toMatchObject({
      marketTps: 91,
      marketTpsP75: 127,
      marketTpsP90: 144,
      marketTpsP99: 184,
      marketTtftMs: 1018,
      marketTtftP75Ms: 1789,
      marketTtftP90Ms: 4632,
      marketTtftP99Ms: 23728,
      observed: null,
    });
  });

  it('joins bridge-provider observations to the canonical market route', () => {
    const rows = buildProviderStatsRoutes(catalog, performance, [observed()]);
    const claude = rows.find((row) => row.provider === 'anthropic');
    expect(claude).toMatchObject({
      marketTps: 59,
      marketTtftMs: 3737,
      observed: {
        provider: 'claude-bridge',
        avgTps: 530.6,
        avgTtftMs: 4400,
        callCount: 100,
      },
    });
  });

  it('keeps locally observed routes when no market route resolves', () => {
    const rows = buildProviderStatsRoutes(catalog, performance, [
      observed({ provider: 'private-proxy', modelId: 'private-model', avgTps: 42 }),
    ]);
    expect(rows).toContainEqual(expect.objectContaining({
      provider: 'private-proxy',
      modelId: 'private-model',
      marketTps: null,
      observed: expect.objectContaining({ avgTps: 42 }),
    }));
  });

  it('excludes catalog routes that have neither performance nor local observations', () => {
    const rows = buildProviderStatsRoutes(catalog, performance, []);
    expect(rows.some((row) => row.modelId === 'no-performance')).toBe(false);
  });
});

describe('provider benchmark profile', () => {
  it('maps real market percentiles without inventing historical points', () => {
    const route = buildProviderStatsRoutes(catalog, performance, [])[0];

    expect(buildProviderBenchmarkProfile(route)).toEqual([
      { percentile: 'p50', tps: 91, ttftMs: 1018 },
      { percentile: 'p75', tps: 127, ttftMs: 1789 },
      { percentile: 'p90', tps: 144, ttftMs: 4632 },
      { percentile: 'p99', tps: 184, ttftMs: 23728 },
    ]);
  });

  it('preserves missing market data for a local-only route', () => {
    const route = buildProviderStatsRoutes(null, null, [
      observed({ provider: 'private-proxy', modelId: 'private-model' }),
    ])[0];

    expect(buildProviderBenchmarkProfile(route)).toEqual([
      { percentile: 'p50', tps: null, ttftMs: null },
      { percentile: 'p75', tps: null, ttftMs: null },
      { percentile: 'p90', tps: null, ttftMs: null },
      { percentile: 'p99', tps: null, ttftMs: null },
    ]);
  });
});

describe('provider chart data', () => {
  it('summarizes local TPS by call volume and market TPS by route', () => {
    const rows = buildProviderStatsRoutes(catalog, performance, [
      observed({ callCount: 3, avgTps: 30 }),
      observed({
        provider: 'anthropic',
        modelId: 'second-local-model',
        callCount: 1,
        avgTps: 90,
      }),
    ]);

    expect(buildProviderChartData(rows)).toEqual([
      {
        provider: 'anthropic',
        providerDisplay: 'Anthropic',
        localTps: 45,
        marketTps: 59,
        localCalls: 4,
        routeCount: 2,
      },
      {
        provider: 'alibaba',
        providerDisplay: 'Alibaba',
        localTps: null,
        marketTps: 91,
        localCalls: 0,
        routeCount: 1,
      },
    ]);
  });

  it('keeps zero TPS values finite and sorts ties by provider name', () => {
    const routes = buildProviderStatsRoutes(null, null, [
      observed({ provider: 'zeta', modelId: 'zero', callCount: 0, avgTps: 0 }),
      observed({ provider: 'alpha', modelId: 'unknown', callCount: 0, avgTps: null }),
    ]);

    expect(buildProviderChartData(routes)).toEqual([
      expect.objectContaining({ provider: 'zeta', localTps: 0, localCalls: 0 }),
      expect.objectContaining({ provider: 'alpha', localTps: null, localCalls: 0 }),
    ]);
  });
});
