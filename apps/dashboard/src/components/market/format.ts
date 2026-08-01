import { formatNumber, type PricingModel } from '@pi-tps/metrics-core';

export function shortModel(id: string): string {
  return id.split('/').pop() ?? id;
}

export function rate(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

export function monthlyCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function subscriptionRate(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  const [whole, decimals = ''] = value.toFixed(5).split('.');
  return `$${whole}.${decimals.replace(/0+$/, '').padEnd(2, '0')}`;
}

export function context(value: number | null): string {
  return value === null ? '—' : formatNumber(value, 0);
}

export function freshness(generatedAt: string, fetchedAt: number | null): string {
  const source = new Date(generatedAt);
  if (Number.isFinite(source.getTime())) return `catalog ${source.toLocaleString()}`;
  return fetchedAt ? `fetched ${new Date(fetchedAt).toLocaleString()}` : 'catalog time unavailable';
}

export function modelKey(model: PricingModel): string {
  return `${model.provider}:${model.id}`;
}
