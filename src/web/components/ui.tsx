import {clsx} from 'clsx';
import {
  CircleCheck,
  CircleX,
  Eye,
  Info,
  OctagonX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {useId, type ButtonHTMLAttributes, type ReactNode} from 'react';
import {levelLabel} from '../../domain/levels';
import type {AlertLevel} from '../../domain/types';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-sky-700',
  secondary:
    'border border-line-strong bg-surface text-ink-soft hover:bg-subtle',
  danger:
    'border border-red-300 bg-surface text-bad hover:bg-red-50 dark:border-red-500/50 dark:hover:bg-red-500/10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** A button in one of the app's three styles. */
export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'focus:ring-accent focus:ring-offset-canvas inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-50',
        BUTTON_STYLES[variant],
        className,
      )}
      {...rest}
    />
  );
}

/** A page title with an icon tile and an optional one-line description. */
export function PageHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle !== undefined && (
          <p className="text-muted text-sm">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/** A panel on the page background. */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        'border-line bg-surface rounded-xl border p-4 shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  inputMode?: 'numeric' | 'email' | 'text';
  required?: boolean;
}

/** A labelled text input. */
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  ...rest
}: TextFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-ink-soft text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-line-strong bg-surface text-ink focus:ring-accent rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
        {...rest}
      />
    </div>
  );
}

/** An error message announced to screen readers. */
export function ErrorText({message}: {message: string | null}) {
  if (message === null) return null;
  return (
    <p role="alert" className="text-bad flex items-start gap-1.5 text-sm">
      <CircleX aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

interface ToggleSwitchProps {
  label: string;
  /** Optional decorative icon shown before the label. */
  icon?: LucideIcon;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** An on/off switch with a visible label (role="switch"). */
export function ToggleSwitch({
  label,
  icon: Icon,
  description,
  checked,
  onChange,
  disabled,
}: ToggleSwitchProps) {
  const descriptionId = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <span className="text-ink inline-flex items-center gap-1.5 text-sm font-medium">
          {Icon !== undefined && (
            <Icon aria-hidden="true" className="text-muted h-4 w-4" />
          )}
          {label}
        </span>
        {description !== undefined && (
          <p id={descriptionId} className="text-muted text-xs">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description === undefined ? undefined : descriptionId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'focus:ring-accent focus:ring-offset-canvas relative inline-flex h-6 w-11 shrink-0 rounded-full transition focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'bg-surface mt-0.5 inline-block h-5 w-5 rounded-full shadow-sm transition',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export const LEVEL_STYLES: Record<
  AlertLevel,
  {badge: string; border: string; tint: string; icon: LucideIcon}
> = {
  info: {
    badge: 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200',
    border: 'border-sky-400 dark:border-sky-500/70',
    tint: 'bg-sky-50 dark:bg-sky-500/10',
    icon: Info,
  },
  watch: {
    badge:
      'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
    border: 'border-amber-500 dark:border-amber-500/80',
    tint: 'bg-amber-50 dark:bg-amber-500/10',
    icon: Eye,
  },
  warning: {
    badge:
      'bg-orange-200 text-orange-950 dark:bg-orange-500/25 dark:text-orange-200',
    border: 'border-orange-600 dark:border-orange-500',
    tint: 'bg-orange-50 dark:bg-orange-500/10',
    icon: TriangleAlert,
  },
  standdown: {
    badge: 'bg-red-700 text-white dark:bg-red-600',
    border: 'border-red-700 dark:border-red-500',
    tint: 'bg-red-50 dark:bg-red-500/15',
    icon: OctagonX,
  },
};

/** A level shown by icon and word, never by colour alone. */
export function LevelBadge({level}: {level: AlertLevel}) {
  const {badge, icon: Icon} = LEVEL_STYLES[level];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        badge,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {levelLabel(level)}
    </span>
  );
}

/** A success or failure result shown with a tick or cross icon. */
export function StatusText({ok, children}: {ok: boolean; children: ReactNode}) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <span
      className={clsx(
        'inline-flex items-start gap-1',
        ok ? 'text-ok' : 'text-bad font-semibold',
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </span>
  );
}
