import {Gauge, RotateCcw, Save, TriangleAlert} from 'lucide-react';
import {useCallback, useId, useState, type FormEvent} from 'react';
import {categoryLabel} from '../../domain/categories';
import {levelLabel} from '../../domain/levels';
import {
  ALERT_CYCLE_MINUTES,
  DEFAULT_THRESHOLDS,
  describeThresholds,
  MEASURES,
  sameLimits,
  THRESHOLD_CATEGORIES,
  thresholdsProblem,
  type LevelLimits,
  type ThresholdCategory,
} from '../../domain/thresholds';
import {ALERT_LEVELS, type AlertLevel} from '../../domain/types';
import {CategoryIcon} from '../components/category_icon';
import {
  Button,
  Card,
  ErrorText,
  LevelBadge,
  PageHeading,
  StatusText,
} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';
import {useUnsavedChanges} from '../layout/unsaved_changes';

/** What is typed in each level's box; empty means the level is off. */
type LimitTexts = Record<AlertLevel, string>;

function toTexts(limits: LevelLimits): LimitTexts {
  return Object.fromEntries(
    ALERT_LEVELS.map((level) => [level, String(limits[level] ?? '')]),
  ) as LimitTexts;
}

/** A plain decimal such as "25" or "2.5"; no signs, exponents or hex. */
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * The typed limits, or why they can't be read as numbers. The boxes are text
 * inputs on purpose: a number input reports half-typed text such as "-" or
 * "1e" as empty, which would silently turn that level off.
 */
function parseTexts(texts: LimitTexts): LevelLimits | string {
  const limits = {} as LevelLimits;
  for (const level of ALERT_LEVELS) {
    const text = texts[level].trim();
    if (text !== '' && !DECIMAL.test(text))
      return `Enter a number for ${levelLabel(level)}, or leave it empty.`;
    limits[level] = text === '' ? null : Number(text);
  }
  return limits;
}

/** Edit the readings at which each weather alert reaches each level. */
export function ThresholdsPage() {
  const api = useApi();
  const load = useCallback(() => api.loadThresholds(), [api]);
  const {data, error, reload} = useAsync(load);
  // Show the defaults if the saved thresholds can't load (for example before
  // the database migration is applied): they are what the job uses then.
  const saved = data ?? (error !== null ? DEFAULT_THRESHOLDS : null);

  return (
    <div className="space-y-6">
      <PageHeading
        icon={Gauge}
        title="Alert thresholds"
        subtitle={`The readings at which each alert goes out and changes level. Changes apply from the next alert cycle (every ${ALERT_CYCLE_MINUTES} minutes).`}
      />
      {data === null && error !== null && <LoadWarning error={error} />}
      {saved !== null && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          {THRESHOLD_CATEGORIES.map((category) => (
            <ThresholdCard
              key={category}
              category={category}
              saved={saved[category]}
              onStored={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LoadWarning({error}: {error: string}) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Couldn&apos;t load the saved thresholds ({error}). Showing the built-in
        defaults, which are what alerts use right now. Saving will fail until
        the thresholds database migration has been applied.
      </span>
    </p>
  );
}

function LimitField({
  category,
  level,
  value,
  onChange,
}: {
  category: ThresholdCategory;
  level: AlertLevel;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const {unit} = MEASURES[category];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>
        <LevelBadge level={level} />
      </label>
      <div className="border-line-strong bg-surface focus-within:ring-accent flex items-center rounded-md border focus-within:ring-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder="Off"
          onChange={(e) => onChange(e.target.value)}
          className="text-ink placeholder:text-muted w-full min-w-0 rounded-md bg-transparent px-3 py-2 text-sm focus:outline-none"
        />
        {unit !== '' && (
          <span aria-hidden="true" className="text-muted pr-3 text-sm">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function ThresholdCard({
  category,
  saved,
  onStored,
}: {
  category: ThresholdCategory;
  saved: LevelLimits;
  /** Called after a save or reset succeeds. */
  onStored: () => void;
}) {
  const api = useApi();
  const [texts, setTexts] = useState(() => toTexts(saved));
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const parsed = parseTexts(texts);
  const unsaved = typeof parsed === 'string' || !sameLimits(parsed, saved);
  useUnsavedChanges(unsaved);

  const {direction, reading} = MEASURES[category];
  const invalid =
    typeof parsed === 'string' ? parsed : thresholdsProblem(category, parsed);

  function change(level: AlertLevel, text: string) {
    setTexts({...texts, [level]: text});
    setStatus(null);
  }

  /** Runs `action`; only once it succeeds are the boxes set to `stored`. */
  async function store(
    action: () => Promise<void>,
    stored: LevelLimits,
    done: string,
  ) {
    setProblem(null);
    try {
      await action();
      setTexts(toTexts(stored));
      setStatus(done);
      onStored();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (invalid !== null || typeof parsed === 'string') {
      setProblem(invalid);
      return;
    }
    await store(
      () => api.saveThresholds({category, limits: parsed}),
      parsed,
      'Saved.',
    );
  }

  async function reset() {
    await store(
      () => api.resetThresholds(category),
      DEFAULT_THRESHOLDS[category],
      'Reset to default.',
    );
  }

  return (
    <Card>
      <form
        onSubmit={save}
        aria-label={`${categoryLabel(category)} thresholds`}
        className="space-y-4"
      >
        <div className="flex items-start gap-3">
          <span className="bg-subtle text-ink-soft inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <CategoryIcon category={category} className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">
              {categoryLabel(category)}
            </h2>
            <p className="text-muted text-sm">
              {reading} {direction === 'above' ? 'at or above' : 'at or below'}{' '}
              each limit raises that level. Leave a level empty to skip it.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ALERT_LEVELS.map((level) => (
            <LimitField
              key={level}
              category={category}
              level={level}
              value={texts[level]}
              onChange={(text) => change(level, text)}
            />
          ))}
        </div>
        <p className="text-muted text-xs" data-testid={`summary-${category}`}>
          {typeof parsed !== 'string' && invalid === null
            ? describeThresholds(category, parsed)
            : 'Fix the limits above to see when alerts go out.'}
        </p>
        <ErrorText message={problem} />
        {status !== null && <StatusText ok>{status}</StatusText>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">
            <Save aria-hidden="true" className="h-4 w-4" />
            Save thresholds
          </Button>
          <Button variant="secondary" onClick={() => void reset()}>
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Reset to default
          </Button>
          {unsaved && (
            <span className="text-muted text-xs">Unsaved changes</span>
          )}
        </div>
      </form>
    </Card>
  );
}
