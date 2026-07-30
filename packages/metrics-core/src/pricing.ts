export interface TokenUsageMix {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface PricingModel {
  id: string;
  name: string;
  org: string;
  provider: string;
  providerDisplay: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  uptime30m: number | null;
  discount: number;
  zdr: boolean;
  subscription: boolean;
  pricing: {
    input: number;
    output: number;
    cacheRead: number | null;
    cacheWrite: number | null;
  };
}

export interface PricingCatalog {
  generatedAt: string;
  models: PricingModel[];
}

export type PricingCatalogResult =
  | { ok: true; catalog: PricingCatalog }
  | { ok: false; error: string };

export interface ModelCostEstimate {
  inputCostUsd: number;
  cacheReadCostUsd: number;
  cacheWriteCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  blendedRateUsdPerM: number;
}

export interface ModelPricingComparison extends ModelCostEstimate {
  model: PricingModel;
  savingsUsd: number | null;
  savingsPct: number | null;
}

export interface PaygDealConstraints {
  stablePricingOnly?: boolean;
  zdrOnly?: boolean;
  minContextLength?: number;
  minUptime30m?: number;
  minThroughputP50?: number;
  maxLatencyP50?: number;
}

export interface PaygDealComparison extends ModelPricingComparison {
  performance: PerformanceRecord | null;
  estimatedCachePricing: boolean;
}

export interface SubscriptionBreakEvenInput {
  monthlyPriceUsd: number;
  inputRateUsdPerM: number;
  outputRateUsdPerM: number;
  inputShare: number;
}

export interface SubscriptionBreakEven {
  blendedRateUsdPerM: number;
  breakEvenTokens: number;
  breakEvenInputTokens: number;
  breakEvenOutputTokens: number;
}

export type SubscriptionBreakEvenResult =
  | { ok: true; value: SubscriptionBreakEven }
  | { ok: false; error: string };

export interface SubscriptionValueInput {
  monthlyPriceUsd: number;
  paygEquivalentUsd: number;
  totalTokens: number;
}

export interface SubscriptionValue {
  monthlySavingsUsd: number;
  valueMultiple: number;
  breakEvenUsageMultiplier: number | null;
  breakEvenTokens: number | null;
  verdict: 'subscription-better' | 'break-even' | 'payg-better';
}

export type SubscriptionValueResult =
  | { ok: true; value: SubscriptionValue }
  | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function nonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : nonnegative(value);
}

function parseModel(value: unknown): PricingModel | null {
  const source = record(value);
  const pricing = record(source?.pricing);
  const id = string(source?.id);
  const provider = string(source?.provider);
  const input = nonnegative(pricing?.input);
  const output = nonnegative(pricing?.output);
  if (!source || !pricing || !id || !provider || input === null || output === null) return null;

  return {
    id,
    name: string(source.name) ?? id,
    org: string(source.org) ?? id.split('/')[0] ?? 'unknown',
    provider,
    providerDisplay: string(source.provider_display) ?? provider,
    contextLength: optionalNumber(source.context_length),
    maxCompletionTokens: optionalNumber(source.max_completion_tokens),
    uptime30m: optionalNumber(source.uptime_30m),
    discount: nonnegative(source.discount) ?? 0,
    zdr: source.zdr === true,
    subscription: source.subscription === true,
    pricing: {
      input,
      output,
      cacheRead: optionalNumber(pricing.cache_read),
      cacheWrite: optionalNumber(pricing.cache_write),
    },
  };
}

export function parsePricingCatalog(value: unknown): PricingCatalogResult {
  const source = record(value);
  if (!source || !Array.isArray(source.models)) {
    return { ok: false, error: 'Pricing catalog must contain a models array' };
  }

  const models = source.models.map(parseModel).filter((model): model is PricingModel => model !== null);
  if (models.length === 0) {
    return { ok: false, error: 'Pricing catalog contains no valid models' };
  }

  return {
    ok: true,
    catalog: {
      generatedAt: string(source.generated_at) ?? '',
      models,
    },
  };
}

function normalizedIdentity(value: string): string {
  const leaf = value.split('/').pop() ?? value;
  return leaf.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export const PROVIDER_PRICING_ALIASES: Readonly<Record<string, string>> = {
  'anthropic-bridge': 'anthropic',
  'claude-bridge': 'anthropic',
  'openai-bridge': 'openai',
  'openai-codex': 'openai',
};

export type PricingMatchStrategy = 'exact' | 'provider-alias' | 'model-family';

export interface PricingModelMatch {
  model: PricingModel;
  strategy: PricingMatchStrategy;
  observedProvider: string;
  canonicalProvider: string;
}

// ─── Performance sidecar (performance.json) ───────────────────────────────
// TokenWatch stores latency and throughput percentiles in a separate file
// keyed by `canonicalModelId|provider`. We parse it here so the dashboard can
// show Market TPS (throughput p50) beside observed TPS without a second fetch.

export interface PerformanceRecord {
  latency: { p50: number | null; p75: number | null; p90: number | null; p99: number | null } | null;
  throughput: { p50: number | null; p75: number | null; p90: number | null; p99: number | null } | null;
}

export interface PerformanceCatalog {
  generatedAt: string;
  /** Route lookup keyed by `canonicalModelId|provider`. */
  records: Record<string, PerformanceRecord>;
}

export type PerformanceCatalogResult =
  | { ok: true; catalog: PerformanceCatalog }
  | { ok: false; error: string };

export interface PricingPerformanceMatch {
  pricingMatch: PricingModelMatch;
  performance: PerformanceRecord;
}

function nonnegOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function parsePercentiles(value: unknown): { p50: number | null; p75: number | null; p90: number | null; p99: number | null } | null {
  const rec = record(value);
  if (!rec) return null;
  const p50 = nonnegOrNull(rec.p50);
  const p75 = nonnegOrNull(rec.p75);
  const p90 = nonnegOrNull(rec.p90);
  const p99 = nonnegOrNull(rec.p99);
  if (p50 === null && p75 === null && p90 === null && p99 === null) return null;
  return { p50, p75, p90, p99 };
}

function parsePerformanceRecord(value: unknown): PerformanceRecord | null {
  const rec = record(value);
  if (!rec) return null;
  const latency = parsePercentiles(rec.latency);
  const throughput = parsePercentiles(rec.throughput);
  if (!latency && !throughput) return null;
  return { latency, throughput };
}

export function parsePerformanceCatalog(value: unknown): PerformanceCatalogResult {
  const source = record(value);
  if (!source) return { ok: false, error: 'Performance catalog must be an object' };
  const records: Record<string, PerformanceRecord> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (key === '_meta') continue;
    const parsed = parsePerformanceRecord(raw);
    if (parsed) records[key] = parsed;
  }
  if (Object.keys(records).length === 0) {
    return { ok: false, error: 'Performance catalog contains no valid route records' };
  }
  const meta = record(source._meta);
  return {
    ok: true,
    catalog: {
      generatedAt: string(meta?.generated_at) ?? '',
      records,
    },
  };
}

/** TokenWatch's canonical model id: strip provider prefix and suffixes, lowercase. */
export function canonicalPerformanceModelId(modelId: string): string {
  let k = modelId.includes('/') ? modelId.split('/').slice(-1)[0]! : modelId;
  k = k
    .replace(/:free$/, '')
    .replace(/:thinking$/, '')
    .replace(/-(\d{4})-(\d{2})-(\d{2})$/, '')
    .replace(/-preview-(\d{2})-(\d{4})$/, '')
    .replace(/-preview-(\d{4})-(\d{2})-(\d{2})$/, '')
    .replace(/-preview-(\d{2})-(\d{2})$/, '')
    .replace(/-preview$/, '')
    .replace(/-(\d{8})$/, '')
    .replace(/-(\d{6})$/, '')
    .toLowerCase()
    .trim();
  return k;
}

/** Build the performance.json lookup key from a resolved PricingModel. */
function performanceKey(model: PricingModel): string {
  return `${canonicalPerformanceModelId(model.id)}|${model.provider}`;
}

/** Look up market performance for a canonical TokenWatch provider route. */
export function findModelPerformance(
  performance: PerformanceCatalog,
  model: PricingModel,
): PerformanceRecord | null {
  return performance.records[performanceKey(model)] ?? null;
}

/** Resolve a TokenWatch performance record through the shared pricing route. */
export function findPricingPerformance(
  performance: PerformanceCatalog,
  pricingModels: PricingModel[],
  observedProvider: string,
  observedModelId: string,
): PricingPerformanceMatch | null {
  const match = resolvePricingModel(pricingModels, observedProvider, observedModelId);
  if (!match) return null;
  const record = findModelPerformance(performance, match.model);
  if (!record) return null;
  return { pricingMatch: match, performance: record };
}

function uniqueProviderMatch(
  models: PricingModel[],
  provider: string,
  normalizedModel: string,
): PricingModel | null {
  const matches = models.filter((model) => model.provider.toLowerCase() === provider
    && (normalizedIdentity(model.id) === normalizedModel
      || normalizedIdentity(model.name) === normalizedModel));
  return matches.length === 1 ? matches[0] : null;
}

function inferModelFamily(modelId: string): string | null {
  const [rawOrganization = ''] = modelId.toLowerCase().split('/');
  const model = normalizedIdentity(modelId);
  if (rawOrganization === 'anthropic' || model.startsWith('claude')) return 'anthropic';
  if (rawOrganization === 'openai'
    || ['gpt', 'chatgpt', 'o1', 'o3', 'o4'].some((prefix) => model.startsWith(prefix))) return 'openai';
  return null;
}

export function resolvePricingModel(
  models: PricingModel[],
  provider: string,
  modelId: string,
): PricingModelMatch | null {
  const observedProvider = provider.trim().toLowerCase();
  const normalizedModel = normalizedIdentity(modelId);
  if (!observedProvider || !normalizedModel) return null;

  const exact = uniqueProviderMatch(models, observedProvider, normalizedModel);
  if (exact) return { model: exact, strategy: 'exact', observedProvider, canonicalProvider: observedProvider };

  const aliasedProvider = PROVIDER_PRICING_ALIASES[observedProvider];
  if (aliasedProvider) {
    const aliased = uniqueProviderMatch(models, aliasedProvider, normalizedModel);
    if (aliased) return {
      model: aliased,
      strategy: 'provider-alias',
      observedProvider,
      canonicalProvider: aliasedProvider,
    };
  }

  const familyProvider = inferModelFamily(modelId);
  if (!familyProvider || familyProvider === aliasedProvider) return null;
  const inferred = uniqueProviderMatch(models, familyProvider, normalizedModel);
  return inferred ? {
    model: inferred,
    strategy: 'model-family',
    observedProvider,
    canonicalProvider: familyProvider,
  } : null;
}

export function findPricingModel(
  models: PricingModel[],
  provider: string,
  modelId: string,
): PricingModel | null {
  return resolvePricingModel(models, provider, modelId)?.model ?? null;
}

export function calculateSubscriptionBreakEven(input: SubscriptionBreakEvenInput): SubscriptionBreakEvenResult {
  if (!Number.isFinite(input.monthlyPriceUsd) || input.monthlyPriceUsd <= 0) {
    return { ok: false, error: 'Subscription price must be greater than zero' };
  }
  if (!Number.isFinite(input.inputShare) || input.inputShare < 0 || input.inputShare > 1) {
    return { ok: false, error: 'Input share must be between zero and one' };
  }
  if (!Number.isFinite(input.inputRateUsdPerM) || input.inputRateUsdPerM < 0
    || !Number.isFinite(input.outputRateUsdPerM) || input.outputRateUsdPerM < 0) {
    return { ok: false, error: 'Input and output rates must be zero or greater' };
  }

  const outputShare = 1 - input.inputShare;
  const blendedRateUsdPerM = Number((
    input.inputRateUsdPerM * input.inputShare + input.outputRateUsdPerM * outputShare
  ).toFixed(12));
  if (blendedRateUsdPerM <= 0) {
    return { ok: false, error: 'Blended token rate must be greater than zero' };
  }
  const breakEvenTokens = input.monthlyPriceUsd / blendedRateUsdPerM * 1_000_000;
  return {
    ok: true,
    value: {
      blendedRateUsdPerM,
      breakEvenTokens,
      breakEvenInputTokens: breakEvenTokens * input.inputShare,
      breakEvenOutputTokens: breakEvenTokens * outputShare,
    },
  };
}

export function calculateSubscriptionValue(input: SubscriptionValueInput): SubscriptionValueResult {
  if (!Number.isFinite(input.monthlyPriceUsd) || input.monthlyPriceUsd <= 0) {
    return { ok: false, error: 'Subscription price must be greater than zero' };
  }
  if (!Number.isFinite(input.paygEquivalentUsd) || input.paygEquivalentUsd < 0) {
    return { ok: false, error: 'PAYG equivalent must be zero or greater' };
  }
  if (!Number.isFinite(input.totalTokens) || input.totalTokens < 0) {
    return { ok: false, error: 'Token usage must be zero or greater' };
  }

  const monthlySavingsUsd = input.paygEquivalentUsd - input.monthlyPriceUsd;
  const breakEvenUsageMultiplier = input.paygEquivalentUsd > 0
    ? input.monthlyPriceUsd / input.paygEquivalentUsd
    : null;
  return {
    ok: true,
    value: {
      monthlySavingsUsd,
      valueMultiple: input.paygEquivalentUsd / input.monthlyPriceUsd,
      breakEvenUsageMultiplier,
      breakEvenTokens: breakEvenUsageMultiplier === null
        ? null
        : input.totalTokens * breakEvenUsageMultiplier,
      verdict: monthlySavingsUsd > 0
        ? 'subscription-better'
        : monthlySavingsUsd === 0 ? 'break-even' : 'payg-better',
    },
  };
}

function tokenCost(tokens: number, ratePerMillion: number): number {
  const safeTokens = Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
  return (safeTokens / 1_000_000) * ratePerMillion;
}

export function estimateModelCost(model: PricingModel, usage: TokenUsageMix): ModelCostEstimate {
  const inputCostUsd = tokenCost(usage.inputTokens, model.pricing.input);
  const cacheReadCostUsd = tokenCost(usage.cacheReadTokens, model.pricing.cacheRead ?? model.pricing.input);
  const cacheWriteCostUsd = tokenCost(usage.cacheWriteTokens, model.pricing.cacheWrite ?? model.pricing.input);
  const outputCostUsd = tokenCost(usage.outputTokens, model.pricing.output);
  const totalCostUsd = inputCostUsd + cacheReadCostUsd + cacheWriteCostUsd + outputCostUsd;
  const totalTokens = Math.max(0, usage.inputTokens) + Math.max(0, usage.cacheReadTokens)
    + Math.max(0, usage.cacheWriteTokens) + Math.max(0, usage.outputTokens);

  return {
    inputCostUsd,
    cacheReadCostUsd,
    cacheWriteCostUsd,
    outputCostUsd,
    totalCostUsd,
    blendedRateUsdPerM: totalTokens > 0 ? totalCostUsd / (totalTokens / 1_000_000) : 0,
  };
}

export function compareModelPricing(
  models: PricingModel[],
  usage: TokenUsageMix,
  observedCostUsd: number | null,
): ModelPricingComparison[] {
  return models
    .map((model) => {
      const estimate = estimateModelCost(model, usage);
      const savingsUsd = observedCostUsd === null ? null : observedCostUsd - estimate.totalCostUsd;
      return {
        model,
        ...estimate,
        savingsUsd,
        savingsPct: observedCostUsd !== null && observedCostUsd > 0 && savingsUsd !== null
          ? (savingsUsd / observedCostUsd) * 100
          : null,
      };
    })
    .sort((a, b) => a.totalCostUsd - b.totalCostUsd || a.model.id.localeCompare(b.model.id));
}

export function comparePaygDeals(
  models: PricingModel[],
  usage: TokenUsageMix,
  observedCostUsd: number | null,
  performanceCatalog: PerformanceCatalog | null,
  constraints: PaygDealConstraints = {},
): PaygDealComparison[] {
  return compareModelPricing(models, usage, observedCostUsd)
    .map((comparison) => ({
      ...comparison,
      performance: performanceCatalog
        ? findModelPerformance(performanceCatalog, comparison.model)
        : null,
      estimatedCachePricing:
        (usage.cacheReadTokens > 0 && comparison.model.pricing.cacheRead === null)
        || (usage.cacheWriteTokens > 0 && comparison.model.pricing.cacheWrite === null),
    }))
    .filter((deal) => {
      const throughputP50 = deal.performance?.throughput?.p50 ?? null;
      const latencyP50 = deal.performance?.latency?.p50 ?? null;
      return (!constraints.stablePricingOnly || deal.model.discount === 0)
        && (!constraints.zdrOnly || deal.model.zdr)
        && (constraints.minContextLength === undefined
          || (deal.model.contextLength !== null && deal.model.contextLength >= constraints.minContextLength))
        && (constraints.minUptime30m === undefined
          || (deal.model.uptime30m !== null && deal.model.uptime30m >= constraints.minUptime30m))
        && (constraints.minThroughputP50 === undefined
          || (throughputP50 !== null && throughputP50 >= constraints.minThroughputP50))
        && (constraints.maxLatencyP50 === undefined
          || (latencyP50 !== null && latencyP50 <= constraints.maxLatencyP50));
    });
}
