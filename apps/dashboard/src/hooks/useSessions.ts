import { useState, useCallback, useEffect } from 'react';
import type { ParsedEvent, SessionState } from '@pi-tps/metrics-core';
import { ingestJsonl, deriveEvents } from '@pi-tps/metrics-core';
import { loadEvents, resetDB } from '../lib/duckdb';
import { MAIN_THREAD_BUDGET_MS, yieldToMainThread } from '../lib/yieldToMainThread';

export interface SessionImport {
  raw: string;
  fileName?: string;
  /** Explicit source session ID for pre-grouped relay imports. */
  sessionId?: string;
}

export async function buildSessionMap(items: SessionImport[]): Promise<Map<string, SessionState>> {
  const sessions = new Map<string, SessionState>();
  let nextYieldAt = performance.now() + MAIN_THREAD_BUDGET_MS;
  for (const item of items) {
    const ingest = ingestJsonl(item.raw, item.sessionId);
    const events = deriveEvents(ingest);
    sessions.set(ingest.sessionId, { raw: item.raw, ingest, events, fileName: item.fileName });
    if (performance.now() >= nextYieldAt) {
      await yieldToMainThread();
      nextYieldAt = performance.now() + MAIN_THREAD_BUDGET_MS;
    }
  }
  return sessions;
}

export function useSessions(setLoading: (v: boolean) => void) {
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [dbVersion, setDbVersion] = useState(0);

  useEffect(() => {
    if (sessions.size === 0) {
      queueMicrotask(() => {
        setDbLoading(false);
        setHasLoaded(false);
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => {
      setDbLoading(true);
      setLoading(false);
    });
    let stale = false;
    const timer = setTimeout(() => {
      const allEvts: ParsedEvent[] = [];
      for (const s of sessions.values()) {
        allEvts.push(...s.events);
      }
      loadEvents(allEvts)
        .then(() => {
          if (!stale) {
            setDbVersion((v) => v + 1);
            setDbLoading(false);
            setHasLoaded(true);
          }
        })
        .catch((err) => {
          console.error('DuckDB load failed:', err);
          if (!stale) setDbLoading(false);
        });
    }, 100);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [sessions, setLoading]);

  const addSession = useCallback((raw: string, fileName?: string) => {
    const ingest = ingestJsonl(raw);
    const evts = deriveEvents(ingest);
    const sid = ingest.sessionId;
    setSessions((prev) => {
      const next = new Map(prev);
      next.set(sid, { raw, ingest, events: evts, fileName });
      return next;
    });
    setActiveSessionId(null);
  }, []);

  const replaceSessions = useCallback(async (items: SessionImport[]) => {
    setSessions(await buildSessionMap(items));
    setActiveSessionId(null);
  }, []);

  const removeSession = useCallback(
    (sid: string) => {
      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(sid);
        return next;
      });
      setActiveSessionId((prev) => (prev === sid ? null : prev));
    },
    [],
  );

  const clearSessions = useCallback(() => {
    setSessions(new Map());
    setActiveSessionId(null);
    setDbLoading(false);
    setHasLoaded(false);
    resetDB().catch(() => {});
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    dbLoading,
    hasLoaded,
    dbVersion,
    addSession,
    replaceSessions,
    removeSession,
    clearSessions,
  };
}
