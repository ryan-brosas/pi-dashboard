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
    <div role="group" aria-label="Color theme" className="flex items-center gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={`${label} theme`}
          aria-pressed={theme === value}
          className={`relative flex items-center justify-center h-7 px-2 text-[11px] font-medium rounded-md transition-colors ${
            theme === value
              ? 'text-[var(--accent-foreground)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title={label}
        >
          {theme === value && (
            <div aria-hidden="true" className="absolute inset-0 bg-[var(--accent)] rounded-md animate-fade-in" />
          )}
          <Icon size={14} weight="bold" className="relative z-10" />
        </button>
      ))}
    </div>
  );
}
