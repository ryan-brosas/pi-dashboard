/**
 * Loads the compact public snapshot for the dashboard fast path.
 *
 * On public deployment, fetches /feed/manifest.json and the compact
 * snapshot.json so the Usage dashboard renders without initializing
 * DuckDB-Wasm or downloading the detailed JSONL feed.
 *
 * Detailed records (for Overview, SQL, request-level inspection) load
 * on demand via loadDetailed(), which fetches the hourly JSONL files
 * and feeds them through the same parser + DuckDB path as local history.
 *
 * Legacy fallback: if a manifest has no snapshot field, falls back to
 * the original detailed-first behavior.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicMetricsSnapshot } from '@pi-tps/metrics-core';
import type { SessionImport } from './useSessions';

interface MetricsManifest {
  version: string;
  files: string[];
  recordCount: number;
  snapshot?: string;
}

const POLL_INTERVAL_MS = 60_000;
const RELAY_SESSION_ID_PATTERN = /"sessionId"\s*:\s*"([^"\\]+)"/;

/** Group relay JSONL lines by their anonymized source session ID. */
export function groupRelayLines(allLines: string): SessionImport[] {
  const bySession = new Map<string, string[]>();
  for (const line of allLines.split('\n')) {
    if (!line.trim()) continue;
    // Relay exports a simple hashed ID. Reading it directly avoids parsing
    // every record here and then parsing the same record again during ingest.
    const sessionId = RELAY_SESSION_ID_PATTERN.exec(line)?.[1] ?? 'relay-unknown';
    const list = bySession.get(sessionId);
    if (list) list.push(line);
    else bySession.set(sessionId, [line]);
  }
  return [...bySession.entries()].map(([sessionId, lines]) => ({
    raw: lines.join('\n') + '\n',
    sessionId,
    fileName: `relay:${sessionId.slice(0, 8)}`,
  }));
}

export interface RemoteMetricsState {
  snapshot: PublicMetricsSnapshot | null;
  manifestVersion: string | null;
  detailedLoading: boolean;
  detailedLoaded: boolean;
  detailedError: string | null;
  loadDetailed: () => Promise<void>;
}

export function useRemoteMetrics(
  replaceSessions: (items: SessionImport[]) => void | Promise<void>,
  onSnapshotDetected: () => void,
): RemoteMetricsState {
  const replaceSessionsRef = useRef(replaceSessions);
  const onDetectRef = useRef(onSnapshotDetected);
  const [snapshot, setSnapshot] = useState<PublicMetricsSnapshot | null>(null);
  const [manifestVersion, setManifestVersion] = useState<string | null>(null);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [detailedLoaded, setDetailedLoaded] = useState(false);
  const [detailedError, setDetailedError] = useState<string | null>(null);
  const detailedLoadingRef = useRef(false);
  const manifestRef = useRef<MetricsManifest | null>(null);
  const detailedLoadedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    replaceSessionsRef.current = replaceSessions;
    onDetectRef.current = onSnapshotDetected;
  }, [replaceSessions, onSnapshotDetected]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout>;

    async function loadMetrics(): Promise<void> {
      if (cancelled) return;
      try {
        const manifestRes = await fetch('/feed/manifest.json', { cache: 'no-cache' });
        if (!manifestRes.ok) return;
        const manifest = (await manifestRes.json()) as MetricsManifest;
        if (manifestRef.current?.version === manifest.version) return;

        if (manifest.snapshot) {
          // Fast path: fetch compact snapshot only
          const snapRes = await fetch('/feed/snapshot.json', { cache: 'no-cache' });
          if (!snapRes.ok) return;
          const snap = (await snapRes.json()) as PublicMetricsSnapshot;
          if (cancelled) return;
          const firstDetection = manifestRef.current === null;
          const detailedMatches = detailedLoadedVersionRef.current === manifest.version;
          manifestRef.current = manifest;
          setManifestVersion(manifest.version);
          setSnapshot(snap);
          setDetailedLoaded(detailedMatches);
          setDetailedError(null);
          if (firstDetection) onDetectRef.current();
        } else {
          // Legacy fallback: fetch detailed JSONL directly
          const lines: string[] = [];
          let allOk = true;
          for (const file of manifest.files) {
            if (cancelled) return;
            const res = await fetch(`/feed/${file}`, { cache: 'no-cache' });
            if (!res.ok) { allOk = false; break; }
            const text = await res.text();
            if (text.trim()) lines.push(text.trim());
          }
          if (cancelled || !allOk || lines.length === 0) return;
          const firstDetection = manifestRef.current === null;
          manifestRef.current = manifest;
          setManifestVersion(manifest.version);
          const imports = groupRelayLines(lines.join('\n'));
          await replaceSessionsRef.current(imports);
          detailedLoadedVersionRef.current = manifest.version;
          setDetailedLoaded(true);
          setDetailedError(null);
          if (firstDetection) onDetectRef.current();
        }
      } catch { /* transient — retry on next poll */ }
    }

    loadMetrics();
    pollTimer = setTimeout(function poll() {
      loadMetrics().then(() => {
        if (!cancelled) pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, []);

  const loadDetailed = useCallback(async () => {
    const currentManifest = manifestRef.current;
    if (detailedLoadingRef.current
        || (currentManifest && detailedLoadedVersionRef.current === currentManifest.version)) return;
    detailedLoadingRef.current = true;
    setDetailedLoading(true);
    setDetailedError(null);
    try {
      let manifest = manifestRef.current;
      if (!manifest) {
        const manifestRes = await fetch('/feed/manifest.json', { cache: 'no-cache' });
        if (!manifestRes.ok) {
          setDetailedError(`Detailed metrics manifest returned HTTP ${manifestRes.status}.`);
          return;
        }
        manifest = (await manifestRes.json()) as MetricsManifest;
        manifestRef.current = manifest;
        setManifestVersion(manifest.version);
      }
      const loadingVersion = manifest.version;
      const lines: string[] = [];
      for (const file of manifest.files) {
        const res = await fetch(`/feed/${file}`, { cache: 'no-cache' });
        if (!res.ok) {
          setDetailedError(`Detailed metrics feed returned HTTP ${res.status}.`);
          return;
        }
        const text = await res.text();
        if (text.trim()) lines.push(text.trim());
      }
      if (lines.length === 0) {
        setDetailedError('Detailed metrics feed was empty.');
        return;
      }
      if (manifestRef.current?.version !== loadingVersion) return;
      const imports = groupRelayLines(lines.join('\n'));
      await replaceSessionsRef.current(imports);
      if (manifestRef.current?.version !== loadingVersion) return;
      detailedLoadedVersionRef.current = loadingVersion;
      setDetailedLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDetailedError(`Detailed metrics request failed: ${message}`);
    } finally {
      detailedLoadingRef.current = false;
      setDetailedLoading(false);
    }
  }, []);

  return { snapshot, manifestVersion, detailedLoading, detailedLoaded, detailedError, loadDetailed };
}
