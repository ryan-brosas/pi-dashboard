import type { ReactNode } from 'react';

/**
 * One label per panel. There is deliberately no icon or subtitle slot:
 * the kicker/title/subtitle stack is what made every panel shout.
 */
export function PanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-6 items-center justify-between gap-4">
      <h3 className="ui-title">{title}</h3>
      {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options, value, onChange, label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`text-2xs font-medium transition-colors ${
              active
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
