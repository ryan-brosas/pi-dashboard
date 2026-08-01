import { Sun, Moon, Desktop } from '@phosphor-icons/react';
import type { Theme } from '../hooks/useTheme';

interface Props {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const options: { value: Theme; icon: React.ElementType; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Desktop, label: 'System' },
];

export default function ThemeToggle({ theme, setTheme }: Props) {
  return (
    <div role="group" aria-label="Color theme" className="flex items-center gap-0.5 rounded-md border border-[var(--border)] p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={`${label} theme`}
          aria-pressed={theme === value}
          className={`relative flex min-h-11 items-center justify-center rounded-md px-3 text-2xs font-medium transition-colors sm:min-h-8 sm:px-2 ${
            theme === value
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
          title={label}
        >
          {theme === value && (
            <div aria-hidden="true" className="absolute inset-0 rounded-md bg-[var(--surface-muted)]" />
          )}
          <Icon size={14} className="relative z-10" />
        </button>
      ))}
    </div>
  );
}
