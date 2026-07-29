/**
 * Browser-safe public surface of the shared metrics core.
 *
 * Exposes event types, the JSONL parser, swear matching, TPS computation,
 * and formatting helpers. These have no Node-only or browser-only runtime
 * dependencies and are consumed by both the dashboard (browser) and the
 * collector (Node).
 *
 * The sanitizer (`./relay`) is deliberately excluded from this barrel: it
 * imports `node:crypto`, so bundling it into a browser build would fail.
 * Node consumers import it explicitly via `@pi-tps/metrics-core/relay`.
 */
export * from './types';
export * from './parser';
export * from './pricing';
export * from './swear';
export * from './publicSnapshot';
