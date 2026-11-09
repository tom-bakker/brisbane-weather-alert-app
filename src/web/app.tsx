import {useCallback, useEffect, useState} from 'react';
import {AlertsPage} from './alerts/alerts_page';
import {AuditPage} from './audit/audit_page';
import {LoginPage} from './auth/login_page';
import {MfaEnrolPage, MfaVerifyPage} from './auth/mfa_page';
import {Button} from './components/ui';
import {useApi, useAsync} from './data/api_context';
import {DashboardPage} from './dashboard/dashboard_page';
import {GroupsPage} from './groups/groups_page';
import {AppShell, type PageId} from './layout/app_shell';
import {AuthFrame} from './auth/login_page';

function Page({id}: {id: PageId}) {
  switch (id) {
    case 'dashboard':
      return <DashboardPage />;
    case 'alerts':
      return <AlertsPage />;
    case 'groups':
      return <GroupsPage />;
    case 'audit':
      return <AuditPage />;
  }
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
        <p className="mb-4 text-sm text-red-700">{error}</p>
        <Button onClick={reload}>Try again</Button>
      </AuthFrame>
    );
  }
  if (step === null)
    return <p className="p-8 text-center text-gray-600">Loading…</p>;

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
          <p className="mb-4 text-sm text-gray-700">
            {step.email} is not the admin account for this app.
          </p>
          <Button onClick={() => void api.signOut()}>Sign out</Button>
        </AuthFrame>
      );
    case 'signed_in':
      return (
        <AppShell
          email={step.email}
          page={page}
          onNavigate={setPage}
          onSignOut={() => void api.signOut()}
        >
          <Page id={page} />
        </AppShell>
      );
  }
}
