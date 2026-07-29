import { UploadSimple } from '@phosphor-icons/react';
import Logo from './Logo';
import { VIEW_TABS, type ViewTab } from './viewTabs';

export const AUTHOR_SITE_URL = 'https://ryanjosebrosas.dev/';

interface Props {
  viewTab: ViewTab;
  onChange: (tab: ViewTab) => void;
  onUpload: () => void;
  canUseSessionTabs: boolean;
}

export default function ViewNavigation({ viewTab, onChange, onUpload, canUseSessionTabs }: Props) {
  return (
    <div className="flex h-full flex-col">
      <a
        href={AUTHOR_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="pi-tps by Ryan Jose Brosas"
        className="mx-3 flex items-center gap-2 rounded-md px-2 pt-5 pb-6 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >
        <Logo size={22} />
        <span className="text-sm font-semibold tracking-tight">pi-tps</span>
      </a>
      <nav aria-label="Primary" className="flex-1 flex flex-col gap-0.5 px-3">
        {VIEW_TABS.map(({ value, label, requiresSession }) => {
          const active = viewTab === value;
          const disabled = requiresSession && !canUseSessionTabs;
          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              disabled={disabled}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors text-left ${
                active
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[var(--brand)] animate-fade-in" />
              )}
              {label}
            </button>
          );
        })}
      </nav>
      <div className="px-3 pb-4">
        <button
          onClick={onUpload}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--surface-muted)] border border-[var(--border)] hover:text-[var(--text-primary)] transition-colors"
          title="Upload telemetry files"
        >
          <UploadSimple size={13} weight="bold" />
          Upload
        </button>
      </div>
    </div>
  );
}
