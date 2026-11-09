import {useCallback} from 'react';
import {airportByCode} from '../../domain/airports';
import {categoryLabel} from '../../domain/categories';
import {formatUtcAndAest} from '../../domain/time';
import {ErrorText, LevelBadge} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';

const HISTORY_LIMIT = 200;

/** Live and past alerts, newest first, for post-event review. */
export function AlertsPage() {
  const api = useApi();
  const load = useCallback(() => api.loadAlertHistory(HISTORY_LIMIT), [api]);
  const {data, error} = useAsync(load);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="text-sm text-gray-600">
          The latest {HISTORY_LIMIT} alerts, newest first.
        </p>
      </div>
      <ErrorText message={error} />
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th scope="col" className="p-2">
                Started
              </th>
              <th scope="col" className="p-2">
                Airport
              </th>
              <th scope="col" className="p-2">
                Alert
              </th>
              <th scope="col" className="p-2">
                Level (peak)
              </th>
              <th scope="col" className="p-2">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="p-2 whitespace-nowrap">
                  {formatUtcAndAest(a.startedAt)}
                </td>
                <td className="p-2">{airportByCode(a.airport).name}</td>
                <td className="p-2">
                  <p className="font-medium">
                    {categoryLabel(a.category)}: {a.triggerValue}
                  </p>
                  <p className="text-gray-600">{a.message}</p>
                </td>
                <td className="p-2">
                  <LevelBadge level={a.level} />
                  {a.peakLevel !== a.level && (
                    <span className="ml-1 text-xs text-gray-600">
                      (peak <LevelBadge level={a.peakLevel} />)
                    </span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {a.status === 'active'
                    ? 'Active'
                    : `Cleared ${formatUtcAndAest(a.clearedAt ?? a.updatedAt)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && (
          <p className="p-4 text-sm text-gray-600">No alerts yet.</p>
        )}
      </div>
    </div>
  );
}
