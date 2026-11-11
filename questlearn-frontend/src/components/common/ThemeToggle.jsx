import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Segmented theme switch, matching the height of the navbar's icon buttons. */
export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-muted/70 p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            title={label}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors duration-150 ${
              compact ? 'w-8' : 'px-2.5'
            } ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-fg-subtle hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            {!compact && <span className="hidden sm:inline">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
