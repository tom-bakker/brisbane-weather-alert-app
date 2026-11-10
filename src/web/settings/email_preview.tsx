import {useMemo} from 'react';
import type {EmailPhase, EmailSections} from '../../domain/email_sections';
import {composeEmail} from '../../domain/notifications';
import type {AlertCategory} from '../../domain/types';
import {sampleEvent} from './sample_event';

/** Renders the real alert email for a sample event, as recipients see it. */
export function EmailPreview({
  category,
  phase,
  sections,
}: {
  category: AlertCategory;
  phase: EmailPhase;
  sections: EmailSections;
}) {
  const email = useMemo(
    () => composeEmail(sampleEvent(category, phase), sections),
    [category, phase, sections],
  );

  return (
    <div className="space-y-2">
      <h3 className="text-ink-soft text-sm font-semibold">Preview</h3>
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
