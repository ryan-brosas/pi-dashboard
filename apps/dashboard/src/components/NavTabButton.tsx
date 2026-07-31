import type { ElementType } from 'react';

interface Props {
  icon: ElementType;
  label: string;
  active: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
  layout: 'rail' | 'bar';
}

export default function NavTabButton({ icon: Icon, label, active, disabled, disabledReason, onClick, layout }: Props) {
  const hint = disabled ? disabledReason : undefined;
  const iconColor = active ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]';
  if (layout === 'rail') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={hint}
        aria-label={hint ? `${label} — ${hint}` : undefined}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left disabled:cursor-not-allowed disabled:opacity-40 ${
          active
            ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
        }`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[var(--brand)] animate-fade-in" />
        )}
        <Icon size={15} weight="bold" className={`shrink-0 ${iconColor}`} aria-hidden="true" />
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      aria-label={hint ? `${label} — ${hint}` : undefined}
      aria-current={active ? 'page' : undefined}
      className={`min-h-11 shrink-0 flex items-center gap-1.5 rounded-md px-3 text-2xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-[var(--surface-muted)] text-[var(--brand)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
      }`}
    >
      <Icon size={13} weight="bold" className={`shrink-0 ${iconColor}`} aria-hidden="true" />
      {label}
    </button>
  );
}
