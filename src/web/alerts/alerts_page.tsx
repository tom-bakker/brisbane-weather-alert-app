import {useCallback} from 'react';
import {airportByCode} from '../../domain/airports';
import {categoryLabel} from '../../domain/categories';
import {formatUtcAndAest} from '../../domain/time';
import {Bell, CircleCheck, PlaneTakeoff, Radio} from 'lucide-react';
import {CategoryIcon} from '../components/category_icon';
import {ErrorText, LevelBadge, PageHeading} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';

const HISTORY_LIMIT = 200;

/** Live and past alerts, newest first, for post-event review. */
export function AlertsPage() {
  const api = useApi();
  const load = useCallback(() => api.loadAlertHistory(HISTORY_LIMIT), [api]);
  const {data, error} = useAsync(load);

  return (
    <div className="space-y-4">
      <PageHeading
        icon={Bell}
        title="Alerts"
        subtitle={`The latest ${HISTORY_LIMIT} alerts, newest first.`}
      />
      <ErrorText message={error} />
      <div className="border-line bg-surface overflow-x-auto rounded-xl border shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas text-muted text-xs tracking-wide uppercase">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Started
              </th>
              <th scope="col" className="p-3 font-medium">
                Airport
              </th>
              <th scope="col" className="p-3 font-medium">
                Alert
              </th>
              <th scope="col" className="p-3 font-medium">
                Level (peak)
              </th>
              <th scope="col" className="p-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {data?.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="p-3 whitespace-nowrap">
                  {formatUtcAndAest(a.startedAt)}
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1.5">
                    <PlaneTakeoff
                      aria-hidden="true"
                      className="text-muted h-3.5 w-3.5"
                    />
                    {airportByCode(a.airport).name}
                  </span>
                </td>
                <td className="p-3">
                  <p className="flex items-center gap-1.5 font-medium">
                    <CategoryIcon
                      category={a.category}
                      className="text-muted h-4 w-4 shrink-0"
                    />
                    {categoryLabel(a.category)}: {a.triggerValue}
                  </p>
                  <p className="text-muted">{a.message}</p>
                </td>
                <td className="p-3">
                  <LevelBadge level={a.level} />
                  {a.peakLevel !== a.level && (
                    <span className="text-muted mt-1 flex items-center gap-1 text-xs whitespace-nowrap">
                      Peak <LevelBadge level={a.peakLevel} />
                    </span>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {a.status === 'active' ? (
                    <span className="text-bad inline-flex items-center gap-1 font-medium">
                      <Radio aria-hidden="true" className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    <span className="text-muted inline-flex items-center gap-1">
                      <CircleCheck
                        aria-hidden="true"
                        className="text-ok h-4 w-4"
                      />
                      Cleared {formatUtcAndAest(a.clearedAt ?? a.updatedAt)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && (
          <p className="text-muted p-4 text-sm">No alerts yet.</p>
        )}
      </div>
    </div>
  );
}
