import {useCallback, useState} from 'react';
import {formatUtcAndAest} from '../../domain/time';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  ScrollText,
  Users,
} from 'lucide-react';
import {Button, ErrorText, PageHeading, StatusText} from '../components/ui';
import type {AuditStatusFilter} from '../data/api';
import {useApi, useAsync} from '../data/api_context';

const PAGE_SIZE = 25;

/** Read-only log of every alert email the system has sent or tried to send. */
export function AuditPage() {
  const api = useApi();
  const [status, setStatus] = useState<AuditStatusFilter>('all');
  const [page, setPage] = useState(0);
  const load = useCallback(
    () => api.loadAudit({status, page, pageSize: PAGE_SIZE}),
    [api, status, page],
  );
  const {data, error} = useAsync(load);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={ScrollText}
          title="Email audit"
          subtitle="Kept for 12 months. Entries cannot be edited or deleted here."
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-status"
            className="text-ink-soft inline-flex items-center gap-1 text-sm font-medium"
          >
            <Filter aria-hidden="true" className="h-3.5 w-3.5" />
            Status
          </label>
          <select
            id="audit-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AuditStatusFilter);
              setPage(0);
            }}
            className="border-line-strong bg-surface text-ink rounded-md border px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>
      <ErrorText message={error} />
      <div className="border-line bg-surface overflow-x-auto rounded-xl border shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas text-muted text-xs tracking-wide uppercase">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Sent
              </th>
              <th scope="col" className="p-3 font-medium">
                Group
              </th>
              <th scope="col" className="p-3 font-medium">
                Subject
              </th>
              <th scope="col" className="p-3 font-medium">
                Recipients
              </th>
              <th scope="col" className="p-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {data?.rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="p-3 whitespace-nowrap">
                  {formatUtcAndAest(row.sentAt)}
                </td>
                <td className="p-3">{row.groupName}</td>
                <td className="p-3">
                  <details>
                    <summary className="cursor-pointer">{row.subject}</summary>
                    <pre className="mt-2 font-sans text-xs whitespace-pre-wrap">
                      {row.body}
                    </pre>
                  </details>
                </td>
                <td className="p-3" title={row.recipients.join(', ')}>
                  <span className="inline-flex items-center gap-1">
                    <Users
                      aria-hidden="true"
                      className="text-muted h-3.5 w-3.5"
                    />
                    {row.recipients.length}
                  </span>
                </td>
                <td className="p-3">
                  <StatusText ok={row.status === 'sent'}>
                    {row.status === 'sent' ? 'Sent' : `Failed: ${row.error}`}
                  </StatusText>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.rows.length === 0 && (
          <p className="text-muted p-4 text-sm">No emails recorded.</p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Newer
        </Button>
        <span className="text-muted text-sm">
          Page {page + 1} of {pages} ({data?.total ?? 0} emails)
        </span>
        <Button
          variant="secondary"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          Older
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
