import {screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {makeGroup} from '../../domain/test_fixtures';
import {FakeApi, renderWithApi} from '../test_api';
import {toggled} from './group_card';
import {GroupsPage} from './groups_page';

afterEach(() => vi.restoreAllMocks());

async function renderGroups(api = new FakeApi()) {
  renderWithApi(<GroupsPage />, api);
  await screen.findByRole('heading', {name: 'Ramp supervisors'});
  return api;
}

describe('GroupsPage', () => {
  it('creates a group and reloads the list', async () => {
    const api = await renderGroups();

    await userEvent.type(
      screen.getByLabelText('New group name'),
      '  Duty managers ',
    );
    await userEvent.click(screen.getByRole('button', {name: 'Create group'}));

    expect(api.createGroup).toHaveBeenCalledWith('Duty managers');
    expect(api.listGroups).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('New group name')).toHaveValue('');
  });

  it('requires a name and shows create errors', async () => {
    const api = await renderGroups();
    await userEvent.click(screen.getByRole('button', {name: 'Create group'}));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a group name.');

    api.createGroup.mockRejectedValueOnce(new Error('duplicate key value'));
    await userEvent.type(
      screen.getByLabelText('New group name'),
      'Ramp supervisors',
    );
    await userEvent.click(screen.getByRole('button', {name: 'Create group'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'duplicate key value',
    );
  });

  it('shows an empty state', async () => {
    const api = new FakeApi();
    api.groups = [];
    renderWithApi(<GroupsPage />, api);
    expect(await screen.findByText('No groups yet.')).toBeInTheDocument();
  });

  it('toggles what a group is alerted for', async () => {
    const api = await renderGroups();

    const uv = screen.getByRole('switch', {name: 'UV exposure'});
    expect(uv).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(uv);
    expect(api.updateGroup).toHaveBeenLastCalledWith('group-1', {
      categories: ['wind', 'uv'],
    });

    await userEvent.click(screen.getByRole('switch', {name: 'Wind gust'}));
    expect(api.updateGroup).toHaveBeenLastCalledWith('group-1', {
      categories: [],
    });

    await userEvent.click(screen.getByRole('switch', {name: 'Cairns (YBCS)'}));
    expect(api.updateGroup).toHaveBeenLastCalledWith('group-1', {
      airports: ['YBBN'],
    });

    await userEvent.click(screen.getByRole('switch', {name: 'Group enabled'}));
    expect(api.updateGroup).toHaveBeenLastCalledWith('group-1', {
      enabled: false,
    });

    await userEvent.selectOptions(
      screen.getByLabelText('Minimum level to email'),
      'warning',
    );
    expect(api.updateGroup).toHaveBeenLastCalledWith('group-1', {
      minLevel: 'warning',
    });
  });

  it('adds members after checking the address', async () => {
    const api = await renderGroups();
    const input = screen.getByLabelText('Add email');

    await userEvent.type(input, 'not-an-email');
    await userEvent.click(screen.getByRole('button', {name: 'Add'}));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid email address.',
    );

    await userEvent.clear(input);
    await userEvent.type(input, 'SUP@example.com');
    await userEvent.click(screen.getByRole('button', {name: 'Add'}));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'sup@example.com is already in this group.',
    );

    await userEvent.clear(input);
    await userEvent.type(input, ' New.Person@Example.com ');
    await userEvent.click(screen.getByRole('button', {name: 'Add'}));
    expect(api.addMember).toHaveBeenCalledWith(
      'group-1',
      'new.person@example.com',
    );
    expect(input).toHaveValue('');
  });

  it('removes members and reports failures', async () => {
    const api = await renderGroups();
    api.removeMember.mockRejectedValueOnce(new Error('permission denied'));

    await userEvent.click(
      screen.getByRole('button', {name: 'Remove sup@example.com'}),
    );

    expect(api.removeMember).toHaveBeenCalledWith('m1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'permission denied',
    );
  });

  it('deletes a group only after confirmation', async () => {
    const api = await renderGroups();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await userEvent.click(screen.getByRole('button', {name: 'Delete group'}));
    expect(api.deleteGroup).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', {name: 'Delete group'}));

    expect(confirm).toHaveBeenCalledWith(
      'Delete the group "Ramp supervisors"? Its audit history is kept.',
    );
    expect(api.deleteGroup).toHaveBeenCalledWith('group-1');
  });

  it('shows an empty member list', async () => {
    const api = new FakeApi();
    api.groups = [makeGroup({members: []})];
    renderWithApi(<GroupsPage />, api);
    const card = (
      await screen.findByRole('heading', {name: 'Ramp supervisors'})
    ).closest('section');
    expect(
      within(card as HTMLElement).getByText(/No members yet/),
    ).toBeInTheDocument();
  });

  it('reports non-Error failures as text', async () => {
    const api = await renderGroups();
    api.updateGroup.mockRejectedValueOnce('offline');
    await userEvent.click(screen.getByRole('switch', {name: 'Heat'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
  });
});

describe('toggled', () => {
  it('adds once and removes', () => {
    expect(toggled(['a'], 'a', true)).toEqual(['a']);
    expect(toggled(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggled(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});
