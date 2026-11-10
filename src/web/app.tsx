import {useCallback, useEffect, useState} from 'react';
import {AlertsPage} from './alerts/alerts_page';
import {LoginPage} from './auth/login_page';
import {MfaEnrolPage, MfaVerifyPage} from './auth/mfa_page';
import {Button} from './components/ui';
import {useApi, useAsync} from './data/api_context';
import {DashboardPage} from './dashboard/dashboard_page';
import {AppShell, type PageId} from './layout/app_shell';
import {
  UnsavedChangesProvider,
  useConfirmLeave,
} from './layout/unsaved_changes';
import {SettingsPage} from './settings/settings_page';
import {AuthFrame} from './auth/login_page';

function Page({id}: {id: PageId}) {
  switch (id) {
    case 'dashboard':
      return <DashboardPage />;
    case 'alerts':
      return <AlertsPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

/** The app pages; leaving a page with unsaved edits asks first. */
function SignedInApp({
  email,
  page,
  onNavigate,
}: {
  email: string;
  page: PageId;
  onNavigate: (page: PageId) => void;
}) {
  const api = useApi();
  const confirmLeave = useConfirmLeave();
  return (
    <AppShell
      email={email}
      page={page}
      onNavigate={(next) => {
        if (next !== page && confirmLeave()) onNavigate(next);
      }}
      onSignOut={() => {
        if (confirmLeave()) void api.signOut();
      }}
    >
      <Page id={page} />
    </AppShell>
  );
}

/** Routes between sign-in steps and, once signed in, the app pages. */
export function App() {
  const api = useApi();
  const loadStep = useCallback(() => api.authStep(), [api]);
  const {data: step, error, reload} = useAsync(loadStep);
  const [page, setPage] = useState<PageId>('dashboard');

  useEffect(() => api.onAuthChange(reload), [api, reload]);

  if (error !== null) {
    return (
      <AuthFrame title="Something went wrong">
        <p className="text-bad mb-4 text-sm">{error}</p>
        <Button onClick={reload}>Try again</Button>
      </AuthFrame>
    );
  }
  if (step === null)
    return <p className="text-muted p-8 text-center">Loading…</p>;

  switch (step.kind) {
    case 'signed_out':
      return <LoginPage />;
    case 'enrol_mfa':
      return <MfaEnrolPage onVerified={reload} />;
    case 'verify_mfa':
      return <MfaVerifyPage factorId={step.factorId} onVerified={reload} />;
    case 'not_admin':
      return (
        <AuthFrame title="Not authorised">
          <p className="text-ink-soft mb-4 text-sm">
            {step.email} is not the admin account for this app.
          </p>
          <Button onClick={() => void api.signOut()}>Sign out</Button>
        </AuthFrame>
      );
    case 'signed_in':
      return (
        <UnsavedChangesProvider>
          <SignedInApp email={step.email} page={page} onNavigate={setPage} />
        </UnsavedChangesProvider>
      );
  }
}
