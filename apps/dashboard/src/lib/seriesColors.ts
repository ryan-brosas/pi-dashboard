/**
 * One colour per token series, shared by every chart, legend, and stacked bar.
 * These drifted into four conflicting mappings across the app before this existed.
 */
export const TOKEN_SERIES = {
  cacheRead: 'var(--chart-positive)',
  input: 'var(--chart-primary)',
  output: 'var(--chart-warning)',
  cacheWrite: 'var(--chart-secondary)',
} as const;
