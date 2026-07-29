import { createHash } from 'node:crypto';

/**
 * Sanitization and aggregation core for the hourly metrics relay exporter.
 * Pure functions only — no filesystem, no network. The exporter script
 * (`scripts/export-metrics.ts`) reads local Pi sessions, feeds parsed events
 * through these functions, and writes the resulting metric-only JSONL.
 *
 * The dashboard ingests the relay output through the same parser that
 * handles local history (customType `pi-relay-usage` and `pi-relay-activity`),
 * so DuckDB-WASM remains the single query/presentation layer for both sources.
 *
 * Privacy boundary: these functions never accept or emit prompt text,
 * tool arguments, tool results, file paths, or session transcripts. Only
 * numeric metrics, model identifiers, and a hashed session id leave the
 * machine. {@link validateNoForbiddenFields} enforces this at the edge.
 */

/** Fields that must never appear in a relay record. */
const FORBIDDEN_FIELDS = [
  'message_content',
  'message_role',
  'message_model',
  'prompt',
  'content',
  'text',
  'response',
  'toolResult',
  'arguments',
  'summary',
  'path',
  'cwd',
];

/** Anonymize a session id into a stable 16-char hex token. */
export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}

export interface RelayUsageInput {
  id: string;
  sessionId: string;
  timestamp: string;
  provider: string;
  modelId: string;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } | null;
}

/** A sanitized per-call usage record ready for the relay JSONL. */
export interface RelayUsageOutput {
  type: 'custom';
  customType: 'pi-relay-usage';
  id: string;
  parentId: null;
  timestamp: string;
  data: {
    sessionId: string;
    model: { provider: string; modelId: string };
    tokens: RelayUsageInput['tokens'];
    cost: RelayUsageInput['cost'];
  };
}

/** Convert a parsed usage/tps event into a sanitized relay record. */
export function sanitizeUsageEvent(input: RelayUsageInput): RelayUsageOutput {
  return {
    type: 'custom',
    customType: 'pi-relay-usage',
    id: input.id,
    parentId: null,
    timestamp: input.timestamp,
    data: {
      sessionId: hashSessionId(input.sessionId),
      model: { provider: input.provider, modelId: input.modelId },
      tokens: input.tokens,
      cost: input.cost,
    },
  };
}

export interface RelayTpsInput {
  id: string;
  sessionId: string;
  eventTimestamp: string;
  provider: string;
  modelId: string;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  timing: { ttftMs: number; totalMs: number; generationMs: number; streamMs?: number | null; stallMs: number; stallCount: number; messageCount: number };
  tps: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } | null;
  rateUsdPerMTokens?: number | null;
  timestamp: number;
}

/** A sanitized TPS record preserving all timing/throughput fields for the relay JSONL. */
export interface RelayTpsOutput {
  type: 'custom';
  customType: 'pi-relay-tps';
  id: string;
  parentId: null;
  timestamp: string;
  data: {
    sessionId: string;
    model: { provider: string; modelId: string };
    tokens: RelayTpsInput['tokens'];
    timing: RelayTpsInput['timing'];
    tps: number;
    cost: RelayTpsInput['cost'];
    rateUsdPerMTokens: number | null;
    timestamp: number;
  };
}

/** Convert a parsed TPS event into a sanitized relay record (no transcript). */
export function sanitizeTpsEvent(input: RelayTpsInput): RelayTpsOutput {
  return {
    type: 'custom',
    customType: 'pi-relay-tps',
    id: input.id,
    parentId: null,
    timestamp: input.eventTimestamp,
    data: {
      sessionId: hashSessionId(input.sessionId),
      model: { provider: input.provider, modelId: input.modelId },
      tokens: input.tokens,
      timing: input.timing,
      tps: input.tps,
      cost: input.cost,
      rateUsdPerMTokens: input.rateUsdPerMTokens ?? null,
      timestamp: input.timestamp,
    },
  };
}
export interface ActivityInput {
  /** ISO timestamp of the individual event. */
  timestamp: string;
  /** Whether this event is a user prompt (counts toward `prompts`). */
  isUserPrompt: boolean;
  /** Bad-word occurrences in this event's prompt (0 when not a prompt). */
  swearCount: number;
  /** Whether a human was active at this timestamp (user prompt present). */
  humanActive: boolean;
  /** Whether the agent was active at this timestamp (model/tool call). */
  agentActive: boolean;
}

export interface ActivityOutput {
  type: 'custom';
  customType: 'pi-relay-activity';
  id: string;
  parentId: null;
  timestamp: string;
  data: {
    sessionId: string;
    prompts: number;
    swearCount: number;
    humanActiveMinutes: number;
    agentActiveMinutes: number;
  };
}

/**
 * Aggregate a single hour's activity inputs into one count-only record.
 * Active minutes are deduplicated by distinct 5-minute windows.
 */
export function buildActivitySummary(
  hour: string,
  sessionId: string,
  inputs: ActivityInput[],
): ActivityOutput {
  let prompts = 0;
  let swearCount = 0;
  const humanWindows = new Set<string>();
  const agentWindows = new Set<string>();

  for (const input of inputs) {
    if (input.isUserPrompt) prompts++;
    swearCount += input.swearCount;
    if (input.humanActive) humanWindows.add(fiveMinuteWindow(input.timestamp));
    if (input.agentActive) agentWindows.add(fiveMinuteWindow(input.timestamp));
  }

  return {
    type: 'custom',
    customType: 'pi-relay-activity',
    id: `relay-activity-${hashSessionId(sessionId).slice(0, 8)}-${hour}`,
    parentId: null,
    timestamp: hour,
    data: {
      sessionId: hashSessionId(sessionId),
      prompts,
      swearCount,
      // Each distinct 5-minute window represents 5 minutes of activity.
      humanActiveMinutes: humanWindows.size * 5,
      agentActiveMinutes: agentWindows.size * 5,
    },
  };
}

/** Truncate an ISO timestamp to its 5-minute window boundary. */
function fiveMinuteWindow(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
  return d.toISOString();
}

/**
 * Reject any object that carries a forbidden transcript/content field.
 * Called at the export boundary so a future schema change cannot leak raw
 * prompts or tool results into the relay files.
 */
export function validateNoForbiddenFields(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const check = (obj: Record<string, unknown>, path: string): void => {
    for (const [key, val] of Object.entries(obj)) {
      if (FORBIDDEN_FIELDS.includes(key)) {
        throw new Error(`Forbidden field "${key}" found at ${path}. Relay records must not carry transcript content.`);
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        check(val as Record<string, unknown>, `${path}.${key}`);
      }
    }
  };
  check(value as Record<string, unknown>, 'root');
}
