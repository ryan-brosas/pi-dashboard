import { describe, expect, it } from 'vitest';
import { normalizeQueryTimestamp } from './usageQueries';
import usageQueriesSrc from './usageQueries.ts?raw';

describe('usage query timestamp compatibility', () => {
  it('uses plain TIMESTAMP values for DuckDB-Wasm interval arithmetic', () => {
    expect(usageQueriesSrc).not.toContain('TIMESTAMPTZ');
    expect(usageQueriesSrc).toContain('CAST(current_timestamp AS TIMESTAMP)');
    expect(usageQueriesSrc).toContain("try_cast(timestamp AS TIMESTAMP)");
  });

  it('normalizes DuckDB microsecond timestamps for browser date rendering', () => {
    expect(normalizeQueryTimestamp(1_785_264_428_000_000)).toBe('2026-07-28T18:47:08.000Z');
    expect(normalizeQueryTimestamp('2026-07-28 18:47:08')).toBe('2026-07-28 18:47:08');
  });

  it('pairs delayed TPS and usage copies one-to-one without losing repeated calls or native cost', () => {
    expect(usageQueriesSrc).toContain('tokens_cache_write, type');
    expect(usageQueriesSrc).toContain('type_rank');
    expect(usageQueriesSrc).toContain('tokens_cache_write, type_rank');
    expect(usageQueriesSrc).toContain("CASE WHEN cost_total > 0 THEN 0 WHEN type = 'tps' THEN 1 ELSE 2 END");
  });
});
