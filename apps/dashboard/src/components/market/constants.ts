import type { UsageRange } from '../../lib/usageQueries';

export const WATCH_RANGES: { key: UsageRange; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'Lifetime' },
];

export const CONTEXT_OPTIONS = [
  { value: 0, label: 'Any context' },
  { value: 32_000, label: '32K+' },
  { value: 128_000, label: '128K+' },
  { value: 200_000, label: '200K+' },
  { value: 1_000_000, label: '1M+' },
];
export const UPTIME_OPTIONS = [
  { value: 0, label: 'Any uptime' },
  { value: 99, label: '99%+' },
  { value: 99.9, label: '99.9%+' },
];
export const TPS_OPTIONS = [
  { value: 0, label: 'Any TPS' },
  { value: 20, label: '20+ TPS' },
  { value: 50, label: '50+ TPS' },
  { value: 100, label: '100+ TPS' },
];
export const LATENCY_OPTIONS = [
  { value: 0, label: 'Any latency' },
  { value: 1_000, label: '≤1s' },
  { value: 3_000, label: '≤3s' },
  { value: 5_000, label: '≤5s' },
];

export type WatchMode = 'market' | 'payg' | 'subscription';
export type BillingOption = 'all' | 'without-subscription' | 'subscription';

export interface SubscriptionPlanPreset {
  id: string;
  name: string;
  monthlyPriceUsd: number;
  referenceProvider: string;
  referenceModelIds: string[];
  overageRateMultiplier?: number;
  limitNote: string;
  analysisNote: string;
  sourceUrl: string | null;
}

export const CLAUDE_REFERENCES = [
  'anthropic/claude-sonnet-5', 'anthropic/claude-opus-5', 'anthropic/claude-haiku-4.5',
];
export const CODEX_REFERENCES = [
  'openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol',
];

export const SUBSCRIPTION_PLANS: SubscriptionPlanPreset[] = [
  {
    id: 'claude-pro', name: 'Claude Pro', monthlyPriceUsd: 20,
    referenceProvider: 'anthropic', referenceModelIds: CLAUDE_REFERENCES,
    limitNote: 'At least 5× Free usage per five-hour session; additional weekly, monthly, model, and feature caps may apply.',
    analysisNote: 'Affordability is an API-equivalent estimate for the selected Claude model and current token mix, not a measured subscription allowance.',
    sourceUrl: 'https://www.anthropic.com/pricing',
  },
  {
    id: 'claude-max-5x', name: 'Claude Max 5×', monthlyPriceUsd: 100,
    referenceProvider: 'anthropic', referenceModelIds: CLAUDE_REFERENCES,
    limitNote: '5× Pro usage per five-hour session with higher output limits; additional caps may apply.',
    analysisNote: 'Affordability compares the fee with direct API rates; Max sells a larger access envelope rather than a published token allowance.',
    sourceUrl: 'https://www.anthropic.com/pricing',
  },
  {
    id: 'makora-starter', name: 'Makora Starter', monthlyPriceUsd: 20,
    referenceProvider: 'makora', referenceModelIds: ['gemma-4-26b-a4b'],
    limitNote: 'Sold out. Includes unlimited usage for models under 40B parameters and one concurrent request.',
    analysisNote: 'Gemma 4 26B is the explicit under-40B reference in the catalog. The affordability estimate applies only while the model remains eligible for the included tier.',
    sourceUrl: 'https://www.makora.com/pricing',
  },
  {
    id: 'makora-developer', name: 'Makora Developer', monthlyPriceUsd: 200,
    referenceProvider: 'makora',
    referenceModelIds: ['deepseek-v4-flash', 'deepseek-v4-pro', 'gemma-4-26b-a4b', 'glm-5.2-fp8', 'glm-5.2-nvfp4', 'kimi-k3'],
    overageRateMultiplier: 0.9,
    limitNote: 'Sold out. Includes unlimited models under 40B, 5,000 requests per five-hour period for other models, a 10% PAYG overage discount, and up to six concurrent requests.',
    analysisNote: 'The base affordability comparator uses full PAYG rates. The request allowance cannot be converted to tokens without an average request shape; discounted overage is reported separately.',
    sourceUrl: 'https://www.makora.com/pricing',
  },
  {
    id: 'codex-pro', name: 'ChatGPT Pro (Codex)', monthlyPriceUsd: 200,
    referenceProvider: 'openai', referenceModelIds: CODEX_REFERENCES,
    limitNote: 'The $200 monthly ChatGPT Pro tier provides maximum Codex tasks. Codex usage still draws from shared five-hour windows and additional weekly limits may apply.',
    analysisNote: 'This is an API-equivalent estimate against a selected OpenAI API model, not confirmation that the subscription exposes that API model or token volume.',
    sourceUrl: 'https://developers.openai.com/codex/pricing',
  },
  {
    id: 'custom', name: 'Custom plan', monthlyPriceUsd: 20,
    referenceProvider: 'anthropic', referenceModelIds: CLAUDE_REFERENCES,
    limitNote: 'Enter the current fee and verify the plan’s model access, quotas, and rate limits.',
    analysisNote: 'Custom fees use direct API rates as a reference and do not assert that the plan includes the selected model.',
    sourceUrl: null,
  },
];
export const MARKET_PAGE_SIZE = 100;
