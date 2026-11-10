import {Send} from 'lucide-react';
import {useCallback, useRef, useState} from 'react';
import {ALERT_CYCLE_MINUTES} from '../../domain/thresholds';
import type {EmailAuditEntry} from '../../domain/types';
import {Button, ErrorText, StatusText} from '../components/ui';
import type {DataApi} from '../data/api';
import {useApi} from '../data/api_context';

type ResendState =
  | {kind: 'idle'}
  | {kind: 'queueing'}
  | {kind: 'queued'; runStarted: boolean}
  | {kind: 'failed'; message: string};

/** Starts an alert run; resolves true when one is on its way. */
export type RunStarter = () => Promise<boolean>;

/**
 * Resends this close together share one run. A dispatched run takes longer
 * than this to start and claim the queue, so it still sends them all; after
 * that, a new resend needs a run of its own.
 */
export const SHARED_RUN_WINDOW_MS = 30_000;

/**
 * A RunStarter shared by the page's Resend buttons, so a burst of resends
 * asks for one run. Clicks during an in-flight request share its outcome.
 */
export function useRunStarter(): RunStarter {
  const api = useApi();
  const last = useRef<{at: number; started: Promise<boolean>} | null>(null);
  return useCallback(() => {
    const now = Date.now();
    if (last.current !== null && now - last.current.at < SHARED_RUN_WINDOW_MS) {
      return last.current.started;
    }
    const started = api.refreshFeeds().then(
      () => true,
      () => false,
    );
    last.current = {at: now, started};
    return started;
  }, [api]);
}

/** Queues the resend, then tries to start a run so it goes out now. */
async function queueResend(
  api: DataApi,
  auditId: number,
  startRun: RunStarter,
): Promise<ResendState> {
  try {
    await api.resendEmail(auditId);
  } catch (e) {
    return {
      kind: 'failed',
      message: e instanceof Error ? e.message : String(e),
    };
  }
  // Queued either way: without a run now, the next scheduled one sends it.
  return {kind: 'queued', runStarted: await startRun()};
}

/** Sends a copy of one audited email to its original recipients. */
export function ResendButton({
  entry,
  startRun,
}: {
  entry: EmailAuditEntry;
  startRun: RunStarter;
}) {
  const api = useApi();
  const [state, setState] = useState<ResendState>({kind: 'idle'});

  if (state.kind === 'queued') {
    return (
      <StatusText ok>
        {state.runStarted
          ? 'Queued. Sends in a few minutes.'
          : `Queued. Sends on the next scheduled run (within ${ALERT_CYCLE_MINUTES} minutes).`}
      </StatusText>
    );
  }

  async function resend() {
    const count = entry.recipients.length;
    const question = `Resend this email to its ${count} original recipient${count === 1 ? '' : 's'}?`;
    if (!window.confirm(question)) return;
    setState({kind: 'queueing'});
    setState(await queueResend(api, entry.id, startRun));
  }

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        className="px-3 py-1"
        aria-label={`Resend ${entry.subject}`}
        disabled={state.kind === 'queueing'}
        onClick={() => void resend()}
      >
        <Send aria-hidden="true" className="h-3.5 w-3.5" />
        Resend
      </Button>
      <ErrorText message={state.kind === 'failed' ? state.message : null} />
    </div>
  );
}
