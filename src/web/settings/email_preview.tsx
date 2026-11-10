import {useId, useMemo, useState} from 'react';
import type {EmailSections} from '../../domain/email_sections';
import {composeEmail} from '../../domain/notifications';
import type {AlertCategory} from '../../domain/types';
import {sampleEvent, type PreviewLevel} from './sample_event';

const LEVEL_OPTIONS: {value: PreviewLevel; label: string}[] = [
  {value: 'info', label: 'Info'},
  {value: 'watch', label: 'Watch'},
  {value: 'warning', label: 'Warning'},
  {value: 'standdown', label: 'Stand-down'},
  {value: 'cleared', label: 'All clear'},
];

/** Renders the real alert email for a sample event, as recipients see it. */
export function EmailPreview({
  category,
  sections,
}: {
  category: AlertCategory;
  sections: EmailSections;
}) {
  const [level, setLevel] = useState<PreviewLevel>('watch');
  const selectId = useId();
  const email = useMemo(
    () => composeEmail(sampleEvent(category, level), sections),
    [category, level, sections],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-ink-soft text-sm font-semibold">Preview</h3>
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-muted text-sm">
            Show as
          </label>
          <select
            id={selectId}
            value={level}
            onChange={(e) => setLevel(e.target.value as PreviewLevel)}
            className="border-line-strong bg-surface text-ink rounded-md border px-2 py-1 text-sm"
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="border-line bg-canvas rounded-md border px-3 py-2 text-sm">
        <span className="text-muted">Subject: </span>
        <span data-testid="preview-subject">{email.subject}</span>
      </p>
      <iframe
        title="Email preview"
        sandbox="allow-same-origin"
        srcDoc={email.html}
        className="border-line h-[560px] w-full rounded-md border bg-white"
      />
    </div>
  );
}
