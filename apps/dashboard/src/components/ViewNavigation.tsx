import { UploadSimple } from '@phosphor-icons/react';
import Logo from './Logo';
import { VIEW_TABS, type ViewTab } from './viewTabs';
import NavTabButton from './NavTabButton';

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
        aria-label="Visit Ryan Jose Brosas home"
        className="mx-3 flex items-center gap-2 rounded-md px-2 pt-5 pb-6 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >
        <Logo size={22} />
        <span className="text-sm font-semibold tracking-tight">pi-tps</span>
      </a>
      <nav aria-label="Primary" className="flex-1 flex flex-col gap-0.5 px-3">
        {VIEW_TABS.map(({ value, label, icon, requiresSession }) => {
          const active = viewTab === value;
          const disabled = requiresSession && !canUseSessionTabs;
          return (
            <NavTabButton
              key={value}
              icon={icon}
              label={label}
              active={active}
              disabled={disabled}
              onClick={() => onChange(value)}
              layout="rail"
            />
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
