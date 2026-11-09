import {useCallback, useState} from 'react';
import {formatUtcAndAest} from '../../domain/time';
import {Button, ErrorText} from '../components/ui';
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
        <div>
          <h1 className="text-2xl font-semibold">Email audit</h1>
          <p className="text-sm text-gray-600">
            Kept for 12 months. Entries cannot be edited or deleted here.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-status"
            className="text-sm font-medium text-gray-700"
          >
            Status
          </label>
          <select
            id="audit-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AuditStatusFilter);
              setPage(0);
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>
      <ErrorText message={error} />
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th scope="col" className="p-2">
                Sent
              </th>
              <th scope="col" className="p-2">
                Group
              </th>
              <th scope="col" className="p-2">
                Subject
              </th>
              <th scope="col" className="p-2">
                Recipients
              </th>
              <th scope="col" className="p-2">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="p-2 whitespace-nowrap">
                  {formatUtcAndAest(row.sentAt)}
                </td>
                <td className="p-2">{row.groupName}</td>
                <td className="p-2">
                  <details>
                    <summary className="cursor-pointer">{row.subject}</summary>
                    <pre className="mt-2 font-sans text-xs whitespace-pre-wrap">
                      {row.body}
                    </pre>
                  </details>
                </td>
                <td className="p-2" title={row.recipients.join(', ')}>
                  {row.recipients.length}
                </td>
                <td className="p-2">
                  {row.status === 'sent' ? (
                    <span className="text-green-800">✓ Sent</span>
                  ) : (
                    <span className="font-semibold text-red-700">
                      ✗ Failed: {row.error}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.rows.length === 0 && (
          <p className="p-4 text-sm text-gray-600">No emails recorded.</p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Newer
        </Button>
        <span className="text-sm text-gray-600">
          Page {page + 1} of {pages} ({data?.total ?? 0} emails)
        </span>
        <Button
          variant="secondary"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          Older
        </Button>
      </div>
    </div>
  );
}
