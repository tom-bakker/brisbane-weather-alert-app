import {screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {DEFAULT_THRESHOLDS} from '../../domain/thresholds';
import {FakeApi, renderWithApi} from '../test_api';
import {SettingsPage} from './settings_page';

const ADMIN = {email: 'admin@example.com', role: 'admin'} as const;

async function openThresholds(api = new FakeApi()) {
  renderWithApi(<SettingsPage user={ADMIN} />, api);
  const tabs = await screen.findByRole('navigation', {name: 'Settings'});
  await userEvent.click(
    within(tabs).getByRole('button', {name: 'Alert thresholds'}),
  );
  await screen.findByRole('heading', {name: 'Alert thresholds'});
  return api;
}

function card(name: string) {
  return within(screen.getByRole('form', {name: `${name} thresholds`}));
}

describe('ThresholdsPage', () => {
  it('shows the limits for the four measured alerts', async () => {
    await openThresholds();
    expect(card('Wind gust').getByLabelText('Watch')).toHaveValue('25');
    expect(card('Wind gust').getByLabelText('Info')).toHaveValue('');
    expect(card('Low visibility').getByLabelText('Warning')).toHaveValue('800');
    expect(card('Heat').getByLabelText('Warning')).toHaveValue('38');
    expect(card('UV exposure').getByLabelText('Info')).toHaveValue('3');
  });

  it('edits and saves a category, with a live summary', async () => {
    const api = await openThresholds();
    const wind = card('Wind gust');
    await userEvent.type(wind.getByLabelText('Info'), '18');
    const watch = wind.getByLabelText('Watch');
    await userEvent.clear(watch);
    await userEvent.type(watch, '22');
    expect(wind.getByText('Unsaved changes')).toBeInTheDocument();
    expect(wind.getByTestId('summary-wind')).toHaveTextContent(
      'Wind or gust of 18 kt or more (Info), 22 kt (Watch), 35 kt (Warning), 45 kt (Stand-down)',
    );

    await userEvent.click(wind.getByRole('button', {name: 'Save thresholds'}));
    expect(api.saveThresholds).toHaveBeenCalledWith({
      category: 'wind',
      limits: {info: 18, watch: 22, warning: 35, standdown: 45},
    });
    expect(await card('Wind gust').findByText('Saved.')).toBeInTheDocument();
    expect(card('Wind gust').queryByText('Unsaved changes')).toBeNull();
  });

  it('turns a level off when its box is emptied', async () => {
    const api = await openThresholds();
    const wind = card('Wind gust');
    await userEvent.clear(wind.getByLabelText('Stand-down'));
    await userEvent.click(wind.getByRole('button', {name: 'Save thresholds'}));
    expect(api.saveThresholds).toHaveBeenCalledWith({
      category: 'wind',
      limits: {info: null, watch: 25, warning: 35, standdown: null},
    });
  });

  it('refuses limits out of order', async () => {
    const api = await openThresholds();
    const vis = card('Low visibility');
    const warning = vis.getByLabelText('Warning');
    await userEvent.clear(warning);
    await userEvent.type(warning, '6000');
    expect(vis.getByTestId('summary-visibility')).toHaveTextContent(
      'Fix the limits above',
    );
    await userEvent.click(vis.getByRole('button', {name: 'Save thresholds'}));
    expect(vis.getByRole('alert')).toHaveTextContent(
      'Warning must be lower than Watch.',
    );
    expect(api.saveThresholds).not.toHaveBeenCalled();
  });

  it('refuses a category with every level off', async () => {
    const api = await openThresholds();
    const heat = card('Heat');
    await userEvent.clear(heat.getByLabelText('Watch'));
    await userEvent.clear(heat.getByLabelText('Warning'));
    await userEvent.click(heat.getByRole('button', {name: 'Save thresholds'}));
    expect(heat.getByRole('alert')).toHaveTextContent(
      'Set at least one level.',
    );
    expect(api.saveThresholds).not.toHaveBeenCalled();
  });

  it('shows a save failure', async () => {
    const api = new FakeApi();
    api.saveThresholds.mockRejectedValueOnce(new Error('permission denied'));
    await openThresholds(api);
    const uv = card('UV exposure');
    await userEvent.click(uv.getByRole('button', {name: 'Save thresholds'}));
    expect(await uv.findByRole('alert')).toHaveTextContent('permission denied');
  });

  it('resets a category to its defaults', async () => {
    const api = new FakeApi();
    api.thresholds = {
      ...DEFAULT_THRESHOLDS,
      heat: {info: null, watch: 30, warning: 33, standdown: null},
    };
    await openThresholds(api);
    expect(card('Heat').getByLabelText('Watch')).toHaveValue('30');

    await userEvent.click(
      card('Heat').getByRole('button', {name: 'Reset to default'}),
    );
    expect(api.resetThresholds).toHaveBeenCalledWith('heat');
    expect(await card('Heat').findByText('Reset to default.')).toBeTruthy();
    expect(card('Heat').getByLabelText('Watch')).toHaveValue('35');
  });

  it('keeps the edited limits when a reset fails', async () => {
    const api = new FakeApi();
    api.thresholds = {
      ...DEFAULT_THRESHOLDS,
      heat: {info: null, watch: 30, warning: 33, standdown: null},
    };
    api.resetThresholds.mockRejectedValueOnce(new Error('offline'));
    await openThresholds(api);

    await userEvent.click(
      card('Heat').getByRole('button', {name: 'Reset to default'}),
    );
    expect(await card('Heat').findByRole('alert')).toHaveTextContent('offline');
    expect(card('Heat').getByLabelText('Watch')).toHaveValue('30');
    expect(card('Heat').queryByText('Unsaved changes')).toBeNull();
  });

  it.each(['-', '1e', '2.', '0x10', '-5', '3,5'])(
    'refuses half-typed or odd input %j instead of turning the level off',
    async (typed) => {
      const api = await openThresholds();
      const wind = card('Wind gust');
      const warning = wind.getByLabelText('Warning');
      await userEvent.clear(warning);
      await userEvent.type(warning, typed);
      expect(wind.getByTestId('summary-wind')).toHaveTextContent(
        'Fix the limits above',
      );
      await userEvent.click(
        wind.getByRole('button', {name: 'Save thresholds'}),
      );
      expect(wind.getByRole('alert')).toHaveTextContent(
        'Enter a number for Warning, or leave it empty.',
      );
      expect(api.saveThresholds).not.toHaveBeenCalled();
    },
  );

  it('accepts decimals and spaces around a number', async () => {
    const api = await openThresholds();
    const uv = card('UV exposure');
    const info = uv.getByLabelText('Info');
    await userEvent.clear(info);
    await userEvent.type(info, ' 2.5 ');
    await userEvent.click(uv.getByRole('button', {name: 'Save thresholds'}));
    expect(api.saveThresholds).toHaveBeenCalledWith({
      category: 'uv',
      limits: {info: 2.5, watch: 8, warning: 11, standdown: null},
    });
  });

  it('falls back to the defaults when saved thresholds cannot load', async () => {
    const api = new FakeApi();
    api.loadThresholds.mockRejectedValue(new Error('relation missing'));
    await openThresholds(api);
    expect(
      screen.getByText(/relation missing.*built-in defaults/),
    ).toBeInTheDocument();
    expect(card('Wind gust').getByLabelText('Watch')).toHaveValue('25');
  });

  it('keeps unsaved limits when switching tabs', async () => {
    await openThresholds();
    await userEvent.type(
      card('UV exposure').getByLabelText('Stand-down'),
      '14',
    );
    const tabs = screen.getByRole('navigation', {name: 'Settings'});
    await userEvent.click(
      within(tabs).getByRole('button', {name: 'Mail groups'}),
    );
    await screen.findByRole('heading', {name: 'Mail groups'});
    await userEvent.click(
      within(tabs).getByRole('button', {name: 'Alert thresholds'}),
    );
    expect(card('UV exposure').getByLabelText('Stand-down')).toHaveValue('14');
  });
});
