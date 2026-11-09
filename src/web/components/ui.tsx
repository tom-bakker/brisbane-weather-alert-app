import {clsx} from 'clsx';
import {useId, type ButtonHTMLAttributes, type ReactNode} from 'react';
import {levelLabel} from '../../domain/levels';
import type {AlertLevel} from '../../domain/types';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
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
        'rounded-md px-4 py-2 text-sm font-medium transition focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none disabled:opacity-50',
        BUTTON_STYLES[variant],
        className,
      )}
      {...rest}
    />
  );
}

/** A white panel. */
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
        'rounded-md border border-gray-200 bg-white p-4 shadow-sm',
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
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:outline-none"
        {...rest}
      />
    </div>
  );
}

/** An error message announced to screen readers. */
export function ErrorText({message}: {message: string | null}) {
  if (message === null) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  );
}

interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** An on/off switch with a visible label (role="switch"). */
export function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: ToggleSwitchProps) {
  const descriptionId = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <span className="text-sm font-medium text-gray-900">{label}</span>
        {description !== undefined && (
          <p id={descriptionId} className="text-xs text-gray-600">
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
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none disabled:opacity-50',
          checked ? 'bg-blue-600' : 'bg-gray-300',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow-sm transition',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export const LEVEL_STYLES: Record<
  AlertLevel,
  {badge: string; border: string; icon: string}
> = {
  info: {
    badge: 'bg-blue-100 text-blue-900',
    border: 'border-blue-400',
    icon: 'ⓘ',
  },
  watch: {
    badge: 'bg-amber-100 text-amber-900',
    border: 'border-amber-500',
    icon: '▲',
  },
  warning: {
    badge: 'bg-orange-200 text-orange-950',
    border: 'border-orange-600',
    icon: '⚠',
  },
  standdown: {
    badge: 'bg-red-700 text-white',
    border: 'border-red-700',
    icon: '⛔',
  },
};

/** A level shown by icon and word, never by colour alone. */
export function LevelBadge({level}: {level: AlertLevel}) {
  const style = LEVEL_STYLES[level];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold',
        style.badge,
      )}
    >
      <span aria-hidden="true">{style.icon}</span>
      {levelLabel(level)}
    </span>
  );
}
