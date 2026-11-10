import {clsx} from 'clsx';
import {LayoutList, RotateCcw, Save, TriangleAlert} from 'lucide-react';
import {useCallback, useId, useMemo, useState, type FormEvent} from 'react';
import {
  defaultSection,
  defaultSections,
  EDITABLE_CATEGORIES,
  EMAIL_ICONS,
  EMAIL_PHASES,
  GUIDANCE_MAX,
  phaseLabel,
  sameSection,
  sectionProblem,
  TITLE_MAX,
  withSection,
  type EmailPhase,
  type EmailSection,
  type EmailSections,
} from '../../domain/email_sections';
import type {AlertCategory} from '../../domain/types';
import {
  Button,
  Card,
  ErrorText,
  PageHeading,
  StatusText,
  TextField,
} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';
import {useUnsavedChanges} from '../layout/unsaved_changes';
import {EmailPreview} from './email_preview';

type SectionKey = `${AlertCategory}:${EmailPhase}`;
type Drafts = Partial<Record<SectionKey, EmailSection>>;

function keyOf({
  category,
  phase,
}: {
  category: AlertCategory;
  phase: EmailPhase;
}) {
  return `${category}:${phase}` as const;
}

/** The saved sections with every draft laid over them. */
function withDrafts(saved: EmailSections, drafts: Drafts): EmailSections {
  return Object.values(drafts).reduce(withSection, saved);
}

/** Sections whose draft differs from what is saved. */
function unsavedKeys(drafts: Drafts, saved: EmailSections): Set<SectionKey> {
  return new Set(
    Object.values(drafts)
      .filter((d) => !sameSection(d, saved[d.category][d.phase]))
      .map(keyOf),
  );
}

/**
 * Edit the icon, title and guidance each alert category adds to its emails,
 * separately for each level and for the all-clear.
 */
export function EmailSectionsPage() {
  const api = useApi();
  const load = useCallback(() => api.loadEmailSections(), [api]);
  const {data, error, reload} = useAsync(load);
  const fallback = useMemo(() => defaultSections(), []);
  const [category, setCategory] = useState<AlertCategory>('wind');
  const [phase, setPhase] = useState<EmailPhase>('watch');
  const [drafts, setDrafts] = useState<Drafts>({});

  // Until the saved sections load (or if they can't), show the defaults so
  // the page still works before the database migration is applied.
  const saved = data ?? (error !== null ? fallback : null);
  const unsaved = useMemo(
    () => (saved === null ? new Set<SectionKey>() : unsavedKeys(drafts, saved)),
    [drafts, saved],
  );
  const current = useMemo(
    () => (saved === null ? null : withDrafts(saved, drafts)),
    [saved, drafts],
  );
  useUnsavedChanges(unsaved.size > 0);

  function keep(section: EmailSection) {
    setDrafts((all) => ({...all, [keyOf(section)]: section}));
  }

  return (
    <div className="space-y-6">
      <PageHeading
        icon={LayoutList}
        title="Email sections"
        subtitle="The heading icon, title and guidance each alert type adds to its email, for every alert level."
      />
      {data === null && error !== null && <LoadWarning error={error} />}
      {current !== null && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <SectionList
            sections={current}
            phase={phase}
            unsaved={unsaved}
            selected={category}
            onSelect={setCategory}
          />
          <div className="space-y-4">
            <PhasePicker
              value={phase}
              unsaved={(p) => unsaved.has(keyOf({category, phase: p}))}
              onChange={setPhase}
            />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
              <SectionEditor
                key={keyOf({category, phase})}
                draft={current[category][phase]}
                unsaved={unsaved.has(keyOf({category, phase}))}
                onChange={keep}
                onStored={(stored) => {
                  keep(stored);
                  reload();
                }}
              />
              <EmailPreview
                category={category}
                phase={phase}
                sections={current}
              />
            </div>
          </div>
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
        Couldn&apos;t load the saved sections ({error}). Showing the built-in
        defaults, which are what emails use right now. Saving will fail until
        the email sections database migration has been applied.
      </span>
    </p>
  );
}

function UnsavedBadge() {
  return (
    <span className="shrink-0 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
      Unsaved
    </span>
  );
}

function SectionList({
  sections,
  phase,
  unsaved,
  selected,
  onSelect,
}: {
  sections: EmailSections;
  /** Which phase's icon and title to show for each category. */
  phase: EmailPhase;
  unsaved: ReadonlySet<SectionKey>;
  selected: AlertCategory;
  onSelect: (category: AlertCategory) => void;
}) {
  return (
    <nav aria-label="Email sections">
      <ul className="space-y-1">
        {EDITABLE_CATEGORIES.map((category) => {
          const section = sections[category][phase];
          const current = category === selected;
          const edited = EMAIL_PHASES.some((p) =>
            unsaved.has(keyOf({category, phase: p})),
          );
          return (
            <li key={category}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(category)}
                className={clsx(
                  'focus:ring-accent flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition focus:ring-2 focus:outline-none',
                  current
                    ? 'border-accent bg-surface shadow-sm'
                    : 'hover:bg-subtle border-transparent',
                )}
              >
                <span aria-hidden="true" className="text-2xl">
                  {section.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{section.title}</span>
                    {edited && <UnsavedBadge />}
                  </span>
                  <span className="text-muted block truncate text-xs">
                    {section.guidance || 'No guidance'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Chooses which alert level (or the all-clear) is edited and previewed. */
function PhasePicker({
  value,
  unsaved,
  onChange,
}: {
  value: EmailPhase;
  unsaved: (phase: EmailPhase) => boolean;
  onChange: (phase: EmailPhase) => void;
}) {
  const id = useId();
  return (
    <div className="border-line bg-surface flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3">
      <label htmlFor={id} className="text-ink-soft text-sm font-medium">
        Alert level
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as EmailPhase)}
        className="border-line-strong bg-surface text-ink focus:ring-accent rounded-md border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
      >
        {EMAIL_PHASES.map((phase) => (
          <option key={phase} value={phase}>
            {phaseLabel(phase)}
            {unsaved(phase) ? ' (unsaved)' : ''}
          </option>
        ))}
      </select>
      <p className="text-muted text-xs">
        Each level and the all-clear has its own icon, title and guidance.
      </p>
    </div>
  );
}

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-ink-soft mb-1 text-sm font-medium">Icon</legend>
      <div className="flex flex-wrap gap-1">
        {EMAIL_ICONS.map((choice) => (
          <label
            key={choice.icon}
            title={choice.name}
            className={clsx(
              'has-focus-visible:ring-accent flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border text-xl transition has-focus-visible:ring-2',
              value === choice.icon
                ? 'border-accent bg-sky-50 dark:bg-sky-500/15'
                : 'border-line hover:bg-subtle',
            )}
          >
            <input
              type="radio"
              name={name}
              value={choice.icon}
              checked={value === choice.icon}
              onChange={() => onChange(choice.icon)}
              aria-label={choice.name}
              className="sr-only"
            />
            <span aria-hidden="true">{choice.icon}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SectionEditor({
  draft,
  unsaved,
  onChange,
  onStored,
}: {
  draft: EmailSection;
  unsaved: boolean;
  onChange: (draft: EmailSection) => void;
  /** Called with what is now stored, after a save or reset succeeds. */
  onStored: (stored: EmailSection) => void;
}) {
  const api = useApi();
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const guidanceId = useId();

  function change(patch: Partial<EmailSection>) {
    onChange({...draft, ...patch});
    setStatus(null);
  }

  async function store(
    action: () => Promise<void>,
    stored: EmailSection,
    done: string,
  ) {
    setProblem(null);
    try {
      await action();
      setStatus(done);
      onStored(stored);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = sectionProblem(draft);
    if (found !== null) {
      setProblem(found);
      return;
    }
    await store(() => api.saveEmailSection(draft), draft, 'Saved.');
  }

  async function reset() {
    const {category, phase} = draft;
    await store(
      () => api.resetEmailSection(category, phase),
      defaultSection(category, phase),
      'Reset to default.',
    );
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-4">
        <h3 className="text-ink text-sm font-semibold">
          {phaseLabel(draft.phase)} email
        </h3>
        <IconPicker value={draft.icon} onChange={(icon) => change({icon})} />
        <TextField
          label="Title"
          value={draft.title}
          onChange={(title) => change({title})}
        />
        <p className="text-muted -mt-3 text-xs">
          Used in the subject and heading. Up to {TITLE_MAX} characters.
        </p>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={guidanceId}
            className="text-ink-soft text-sm font-medium"
          >
            What to do
          </label>
          <textarea
            id={guidanceId}
            value={draft.guidance}
            rows={5}
            onChange={(e) => change({guidance: e.target.value})}
            className="border-line-strong bg-surface text-ink focus:ring-accent rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          <p className="text-muted text-xs">
            Shown in a box under the alert; line breaks are kept. Leave empty to
            hide it. {draft.guidance.trim().length}/{GUIDANCE_MAX}
          </p>
        </div>
        <ErrorText message={problem} />
        {status !== null && <StatusText ok>{status}</StatusText>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">
            <Save aria-hidden="true" className="h-4 w-4" />
            Save section
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
