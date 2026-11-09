import {useCallback, useState, type FormEvent} from 'react';
import {Button, Card, ErrorText, TextField} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';
import {GroupCard} from './group_card';

/** Create mail groups and manage who gets which alerts. */
export function GroupsPage() {
  const api = useApi();
  const load = useCallback(() => api.listGroups(), [api]);
  const {data: groups, error, reload} = useAsync(load);
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setCreateError('Enter a group name.');
      return;
    }
    setCreateError(null);
    try {
      await api.createGroup(trimmed);
      setName('');
      reload();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mail groups</h1>
        <p className="text-sm text-gray-600">
          Each group gets an email when an alert it subscribes to is raised,
          escalated or cleared.
        </p>
      </div>
      <Card>
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <TextField label="New group name" value={name} onChange={setName} />
          </div>
          <Button type="submit">Create group</Button>
        </form>
        <div className="mt-2">
          <ErrorText message={createError} />
        </div>
      </Card>
      <ErrorText message={error} />
      {groups?.length === 0 && (
        <p className="text-sm text-gray-600">No groups yet.</p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {groups?.map((g) => (
          <GroupCard key={g.id} group={g} onChanged={reload} />
        ))}
      </div>
    </div>
  );
}
