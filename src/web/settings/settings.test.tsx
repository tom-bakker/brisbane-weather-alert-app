import {screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {defaultSection} from '../../domain/email_sections';
import {FakeApi, renderWithApi} from '../test_api';
import {SettingsPage} from './settings_page';

async function openSections(api = new FakeApi()) {
  renderWithApi(<SettingsPage />, api);
  await screen.findByRole('navigation', {name: 'Email sections'});
  return api;
}

function sectionButton(name: RegExp) {
  const list = screen.getByRole('navigation', {name: 'Email sections'});
  return within(list).getByRole('button', {name});
}

describe('SettingsPage', () => {
  it('switches between email sections, mail groups and audit', async () => {
    await openSections();
    const tabs = screen.getByRole('navigation', {name: 'Settings'});
    expect(
      within(tabs).getByRole('button', {name: 'Email sections'}),
    ).toHaveAttribute('aria-current', 'page');

    await userEvent.click(
      within(tabs).getByRole('button', {name: 'Mail groups'}),
    );
    expect(
      await screen.findByRole('heading', {name: 'Mail groups'}),
    ).toBeInTheDocument();
    await userEvent.click(
      within(tabs).getByRole('button', {name: 'Email audit'}),
    );
    expect(
      await screen.findByRole('heading', {name: 'Email audit'}),
    ).toBeInTheDocument();
  });

  it('lists the six weather sections', async () => {
    await openSections();
    const list = screen.getByRole('navigation', {name: 'Email sections'});
    const names = within(list)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual([
      expect.stringContaining('Wind gust'),
      expect.stringContaining('Thunderstorm'),
      expect.stringContaining('Low visibility'),
      expect.stringContaining('Heat'),
      expect.stringContaining('UV exposure'),
      expect.stringContaining('Tropical cyclone'),
    ]);
  });

  it('edits a section, previews it live and saves it', async () => {
    const api = await openSections();
    await userEvent.click(sectionButton(/UV exposure/));
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Sun safety');
    await userEvent.click(screen.getByRole('radio', {name: 'Sunglasses'}));

    expect(screen.getByTestId('preview-subject')).toHaveTextContent(
      '[WATCH] Sun safety UV 9.9 at Brisbane (YBBN)',
    );
    const preview = screen.getByTitle('Email preview');
    expect(preview.getAttribute('srcdoc')).toContain('😎');

    await userEvent.click(screen.getByRole('button', {name: 'Save section'}));
    expect(api.saveEmailSection).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'uv',
        title: 'Sun safety',
        icon: '😎',
      }),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sectionButton(/Sun safety/)).toBeInTheDocument();
  });

  it('previews the all-clear', async () => {
    await openSections();
    await userEvent.selectOptions(screen.getByLabelText('Show as'), 'cleared');
    expect(screen.getByTestId('preview-subject')).toHaveTextContent(
      '[ALL CLEAR] Wind gust at Brisbane (YBBN)',
    );
  });

  it('refuses to save an empty title', async () => {
    const api = await openSections();
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.click(screen.getByRole('button', {name: 'Save section'}));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a title.');
    expect(api.saveEmailSection).not.toHaveBeenCalled();
  });

  it('shows a save failure', async () => {
    const api = new FakeApi();
    api.saveEmailSection.mockRejectedValueOnce(new Error('permission denied'));
    await openSections(api);
    await userEvent.click(screen.getByRole('button', {name: 'Save section'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'permission denied',
    );
  });

  it('resets a section to its default', async () => {
    const api = new FakeApi();
    api.sections.heat = {...defaultSection('heat'), title: 'Hot'};
    await openSections(api);
    await userEvent.click(sectionButton(/Hot/));
    expect(screen.getByLabelText('Title')).toHaveValue('Hot');

    await userEvent.click(
      screen.getByRole('button', {name: 'Reset to default'}),
    );
    expect(api.resetEmailSection).toHaveBeenCalledWith('heat');
    expect(await screen.findByText('Reset to default.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Heat');
  });

  it('keeps unsaved drafts when switching sections and tabs', async () => {
    await openSections();
    await userEvent.type(screen.getByLabelText('Title'), ' now');
    expect(sectionButton(/Wind gust now/)).toHaveTextContent('Unsaved');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await userEvent.click(sectionButton(/Heat/));
    expect(screen.getByLabelText('Title')).toHaveValue('Heat');
    await userEvent.click(sectionButton(/Wind gust now/));
    expect(screen.getByLabelText('Title')).toHaveValue('Wind gust now');

    const tabs = screen.getByRole('navigation', {name: 'Settings'});
    await userEvent.click(
      within(tabs).getByRole('button', {name: 'Mail groups'}),
    );
    await screen.findByRole('heading', {name: 'Mail groups'});
    await userEvent.click(
      within(tabs).getByRole('button', {name: 'Email sections'}),
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Wind gust now');
  });

  it('clears the unsaved mark once saved', async () => {
    await openSections();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', {name: 'Save section'}));
    await screen.findByText('Saved.');
    await waitFor(() =>
      expect(sectionButton(/Wind gust!/)).not.toHaveTextContent('Unsaved'),
    );
  });

  it('falls back to the defaults when saved sections cannot load', async () => {
    const api = new FakeApi();
    api.loadEmailSections.mockRejectedValue(new Error('relation missing'));
    renderWithApi(<SettingsPage />, api);

    expect(await screen.findByRole('status')).toHaveTextContent(
      /relation missing.*built-in defaults/,
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Wind gust');
    expect(screen.getByTestId('preview-subject')).toHaveTextContent(
      '[WATCH] Wind gust',
    );
  });

  it('keeps line breaks in the guidance preview', async () => {
    await openSections();
    const guidance = screen.getByLabelText('What to do');
    await userEvent.clear(guidance);
    await userEvent.type(guidance, 'One{Enter}Two');
    expect(screen.getByTitle('Email preview').getAttribute('srcdoc')).toContain(
      'One<br>Two',
    );
  });

  it('counts guidance characters', async () => {
    await openSections();
    const guidance = screen.getByLabelText('What to do');
    await userEvent.clear(guidance);
    await userEvent.type(guidance, 'Drink water');
    expect(screen.getByText(/11\/600/)).toBeInTheDocument();
  });
});
