import { CaretDown, FolderOpen, X } from '@phosphor-icons/react';

export interface SessionOption {
  sessionId: string;
  label: string;
  requestCount: number;
  detailedCount?: number;
}

interface Props {
  sessions: SessionOption[];
  activeSessionId: string | null;
  onSelect: (sessionId: string | null) => void;
  onRemove: (sessionId: string) => void;
  onClearAll: () => void;
  loading?: boolean;
}

export default function SessionScope({ sessions, activeSessionId, onSelect, onRemove, onClearAll, loading = false }: Props) {
  const active = sessions.find((s) => s.sessionId === activeSessionId) ?? null;
  return (
    <div className="px-4 sm:px-6 pb-2.5 flex items-center gap-2" aria-busy={loading || undefined}>
      <FolderOpen size={13} className="text-[var(--text-tertiary)] shrink-0" weight="bold" aria-hidden="true" />
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <select
          value={activeSessionId ?? ''}
          onChange={(e) => onSelect(e.target.value || null)}
          aria-label="Session scope"
          className="h-11 w-full appearance-none truncate rounded-md border border-[var(--border)] bg-[var(--surface-muted)] pl-2.5 pr-7 text-2xs font-medium text-[var(--text-secondary)] focus:border-[var(--brand)] focus:outline-none sm:h-7 sm:w-56"
        >
          <option value="">All runs ({sessions.length})</option>
          {sessions.map((s) => (
            <option key={s.sessionId} value={s.sessionId}>
              {s.label} ({s.requestCount}{s.detailedCount === 0 ? ' · usage only' : ''})
            </option>
          ))}
        </select>
        <CaretDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
      </div>
      {loading && (
        <span role="status" aria-live="polite" className="shrink-0 text-2xs font-medium text-[var(--text-tertiary)]">
          Loading run…
        </span>
      )}
      {active && (
        <button
          type="button"
          onClick={() => onRemove(active.sessionId)}
          className="flex h-11 w-11 items-center justify-center rounded-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--brand-text)] sm:h-7 sm:w-7"
          title="Remove run"
          aria-label={`Remove ${active.label}`}
        >
          <X size={12} weight="bold" />
        </button>
      )}
      <button
        type="button"
        onClick={onClearAll}
        className="h-11 shrink-0 rounded-md border-l border-[var(--border)] px-2 pl-3 text-2xs font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--brand-text)] sm:h-7"
      >
        Clear all
      </button>
    </div>
  );
}
