import {
  BellRing,
  PlaneTakeoff,
  SlidersHorizontal,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {CATEGORY_ICONS} from '../components/category_icon';
import {AIRPORTS} from '../../domain/airports';
import {categoryDescription, categoryLabel} from '../../domain/categories';
import {levelLabel} from '../../domain/levels';
import type {Thresholds} from '../../domain/thresholds';
import {
  ALERT_CATEGORIES,
  ALERT_LEVELS,
  type AlertLevel,
  type MailGroup,
} from '../../domain/types';
import {
  Button,
  Card,
  ErrorText,
  TextField,
  ToggleSwitch,
} from '../components/ui';
import {isValidEmail, type GroupPatch} from '../data/api';
import {useApi} from '../data/api_context';

/** `list` with `item` added (on) or removed (off), keeping no duplicates. */
export function toggled<T>(list: readonly T[], item: T, on: boolean): T[] {
  const without = list.filter((x) => x !== item);
  return on ? [...without, item] : without;
}

interface GroupCardProps {
  group: MailGroup;
  /** Used to describe what triggers each category. */
  thresholds: Thresholds;
  onChanged: () => void;
}

/** One mail group: subscriptions, minimum level and members. */
export function GroupCard({group, thresholds, onChanged}: GroupCardProps) {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const update = (patch: GroupPatch) =>
    run(() => api.updateGroup(group.id, patch));

  function addMember(event: FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!isValidEmail(address)) {
      setError('Enter a valid email address.');
      return;
    }
    if (group.members.some((m) => m.email === address)) {
      setError(`${address} is already in this group.`);
      return;
    }
    void run(async () => {
      await api.addMember(group.id, address);
      setEmail('');
    });
  }

  function remove() {
    if (
      window.confirm(
        `Delete the group "${group.name}"? Its audit history is kept.`,
      )
    ) {
      void run(() => api.deleteGroup(group.id));
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users aria-hidden="true" className="text-accent h-5 w-5" />
          {group.name}
        </h2>
        <Button variant="danger" onClick={remove} disabled={busy}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Delete group
        </Button>
      </div>
      <ErrorText message={error} />

      <ToggleSwitch
        label="Group enabled"
        description="When off, this group receives no emails."
        checked={group.enabled}
        disabled={busy}
        onChange={(on) => void update({enabled: on})}
      />

      <fieldset>
        <legend className="text-ink-soft flex items-center gap-1.5 text-sm font-semibold">
          <PlaneTakeoff aria-hidden="true" className="h-4 w-4" />
          Airports
        </legend>
        {AIRPORTS.map((a) => (
          <ToggleSwitch
            key={a.code}
            label={`${a.name} (${a.code})`}
            checked={group.airports.includes(a.code)}
            disabled={busy}
            onChange={(on) =>
              void update({airports: toggled(group.airports, a.code, on)})
            }
          />
        ))}
      </fieldset>

      <fieldset>
        <legend className="text-ink-soft flex items-center gap-1.5 text-sm font-semibold">
          <BellRing aria-hidden="true" className="h-4 w-4" />
          Alert for
        </legend>
        <div className="divide-line divide-y">
          {ALERT_CATEGORIES.map((c) => (
            <ToggleSwitch
              key={c}
              label={categoryLabel(c)}
              icon={CATEGORY_ICONS[c]}
              description={categoryDescription(c, thresholds)}
              checked={group.categories.includes(c)}
              disabled={busy}
              onChange={(on) =>
                void update({categories: toggled(group.categories, c, on)})
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`min-level-${group.id}`}
          className="text-ink-soft flex items-center gap-1.5 text-sm font-semibold"
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          Minimum level to email
        </label>
        <select
          id={`min-level-${group.id}`}
          value={group.minLevel}
          disabled={busy}
          onChange={(e) =>
            void update({minLevel: e.target.value as AlertLevel})
          }
          className="border-line-strong bg-surface text-ink focus:ring-accent rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-60"
        >
          {ALERT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)} and above
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="text-ink-soft flex items-center gap-1.5 text-sm font-semibold">
          <Users aria-hidden="true" className="h-4 w-4" />
          Members ({group.members.length})
        </h3>
        {group.members.length === 0 ? (
          <p className="text-muted text-sm">
            No members yet. Add an email address below.
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {group.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 py-1 text-sm"
              >
                <span>{m.email}</span>
                <Button
                  variant="secondary"
                  aria-label={`Remove ${m.email}`}
                  disabled={busy}
                  onClick={() => void run(() => api.removeMember(m.id))}
                >
                  <UserMinus aria-hidden="true" className="h-4 w-4" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={addMember}
          noValidate
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <div className="flex-1">
            <TextField
              label="Add email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={busy}>
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            Add
          </Button>
        </form>
      </div>
    </Card>
  );
}
