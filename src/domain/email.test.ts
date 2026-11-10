import {describe, expect, it} from 'vitest';
import {
  defaultSection,
  defaultSections,
  EDITABLE_CATEGORIES,
  GUIDANCE_MAX,
  mergeSections,
  sameSection,
  sectionProblem,
  TITLE_MAX,
  type EmailSection,
} from './email_sections';
import {escapeHtml, escapeMultiline} from './email_html';
import {composeEmail} from './notifications';
import {makeAlert} from './test_fixtures';
import {ALERT_CATEGORIES} from './types';

function section(overrides: Partial<EmailSection> = {}): EmailSection {
  return {...defaultSection('wind'), ...overrides};
}

describe('email sections', () => {
  it('has a default for every category', () => {
    const sections = defaultSections();
    for (const category of ALERT_CATEGORIES) {
      expect(sections[category].category).toBe(category);
      expect(sectionProblem(sections[category])).toBeNull();
    }
  });

  it('lists the six weather sections for editing', () => {
    expect(EDITABLE_CATEGORIES).toEqual([
      'wind',
      'thunderstorm',
      'visibility',
      'heat',
      'uv',
      'cyclone',
    ]);
  });

  it('lays saved sections over the defaults', () => {
    const saved = section({category: 'uv', title: 'Sun'});
    const sections = mergeSections([saved]);
    expect(sections.uv).toBe(saved);
    expect(sections.wind).toEqual(defaultSection('wind'));
  });

  it.each([
    [{title: '  '}, 'Enter a title.'],
    [{title: 'x'.repeat(TITLE_MAX + 1)}, 'Keep the title to 60 characters.'],
    [
      {guidance: 'x'.repeat(GUIDANCE_MAX + 1)},
      'Keep the guidance to 600 characters.',
    ],
    [{icon: '<svg>'}, 'Pick one of the listed icons.'],
  ])('rejects %o', (overrides, problem) => {
    expect(sectionProblem(section(overrides))).toBe(problem);
  });

  it('accepts limits exactly and empty guidance', () => {
    expect(
      sectionProblem(section({title: 'x'.repeat(TITLE_MAX), guidance: ''})),
    ).toBeNull();
    expect(
      sectionProblem(section({guidance: 'x'.repeat(GUIDANCE_MAX)})),
    ).toBeNull();
  });
});

describe('sameSection', () => {
  it('ignores surrounding spaces but not content', () => {
    const base = section();
    expect(sameSection(base, {...base, title: ` ${base.title} `})).toBe(true);
    expect(sameSection(base, {...base, guidance: 'Other'})).toBe(false);
    expect(sameSection(base, {...base, icon: '🚩'})).toBe(false);
    expect(sameSection(base, {...base, category: 'uv'})).toBe(false);
  });
});

describe('HTML alert email', () => {
  const url = 'https://example.github.io/app/?a=1&b=2';

  it('shows the section icon, level, place, details and guidance', () => {
    const {html} = composeEmail(
      {kind: 'raised', alert: makeAlert({level: 'warning'})},
      url,
    );
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('💨');
    expect(html).toContain('⚠️ Warning');
    expect(html).toContain('Brisbane (YBBN)');
    expect(html).toContain('Wind 20 kt, gusting 27 kt.');
    expect(html).toContain('27 kt');
    expect(html).toContain('2026-11-09 22:00 AEST / 12:00 UTC');
    expect(html).toContain('What to do');
    expect(html).toContain(`href="${escapeHtml(url)}"`);
    expect(html).not.toContain('<svg');
  });

  it('labels an escalation in the headline', () => {
    const {html} = composeEmail({kind: 'escalated', alert: makeAlert()});
    expect(html).toContain('Wind gust escalated');
    expect(html).not.toContain('Open dashboard');
  });

  it.each([
    ['info', 'ℹ️ Info'],
    ['watch', '👁️ Watch'],
    ['standdown', '🛑 Stand-down'],
  ] as const)('marks a %s alert', (level, badge) => {
    const {html} = composeEmail({kind: 'raised', alert: makeAlert({level})});
    expect(html).toContain(badge);
  });

  it('writes an all-clear without guidance', () => {
    const email = composeEmail({
      kind: 'cleared',
      alert: makeAlert({status: 'cleared', peakLevel: 'warning'}),
    });
    expect(email.html).toContain('✅ All clear');
    expect(email.html).toContain('Wind gust has cleared');
    expect(email.html).toContain('Conditions are back below alert levels.');
    expect(email.html).toContain('Warning');
    expect(email.html).not.toContain('What to do');
    expect(email.text).not.toContain('What to do');
  });

  it('uses and escapes the edited section', () => {
    const sections = mergeSections([
      section({icon: '🚩', title: 'Gusts <b>', guidance: 'Tie "down" & go'}),
    ]);
    const email = composeEmail(
      {kind: 'raised', alert: makeAlert()},
      null,
      sections,
    );
    expect(email.subject).toBe('[WATCH] Gusts <b> 27 kt at Brisbane (YBBN)');
    expect(email.html).toContain('🚩');
    expect(email.html).toContain('Gusts &lt;b&gt;');
    expect(email.html).toContain('Tie &quot;down&quot; &amp; go');
    expect(email.text).toContain('What to do: Tie "down" & go');
  });

  it('keeps line breaks in guidance', () => {
    expect(escapeMultiline('a <b>\r\nc\nd')).toBe('a &lt;b&gt;<br>c<br>d');
    const email = composeEmail(
      {kind: 'raised', alert: makeAlert()},
      null,
      mergeSections([section({guidance: 'One\nTwo'})]),
    );
    expect(email.html).toContain('One<br>Two');
    expect(email.text).toContain('What to do: One\nTwo');
  });

  it('is built for Outlook and light mode', () => {
    const {html} = composeEmail({kind: 'raised', alert: makeAlert()}, url);
    expect(html).toContain(
      '<!--[if mso]><table role="presentation" width="600"',
    );
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
    expect(html).toContain('bgcolor="#fef3c7"');
    expect(html).toContain('bgcolor="#0284c7"');
    expect(html).toContain(
      '<meta name="supported-color-schemes" content="light">',
    );
    expect(html).not.toContain('display:inline-block;background');
  });

  it('hides the guidance box when the guidance is empty', () => {
    const email = composeEmail(
      {kind: 'raised', alert: makeAlert()},
      null,
      mergeSections([section({guidance: '  '})]),
    );
    expect(email.html).not.toContain('What to do');
    expect(email.text).not.toContain('What to do');
  });
});
