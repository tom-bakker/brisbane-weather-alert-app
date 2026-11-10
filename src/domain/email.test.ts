import {describe, expect, it} from 'vitest';
import {
  defaultSection,
  defaultSections,
  EDITABLE_CATEGORIES,
  EMAIL_PHASES,
  GUIDANCE_MAX,
  isEmailPhase,
  mergeSections,
  phaseLabel,
  withSection,
  sameSection,
  sectionProblem,
  TITLE_MAX,
  type EmailSection,
} from './email_sections';
import {escapeMultiline} from './email_html';
import {composeEmail} from './notifications';
import {makeAlert} from './test_fixtures';
import {ALERT_CATEGORIES} from './types';

function section(overrides: Partial<EmailSection> = {}): EmailSection {
  return {...defaultSection('wind', 'watch'), ...overrides};
}

describe('email sections', () => {
  it('has a valid default for every category and phase', () => {
    const sections = defaultSections();
    for (const category of ALERT_CATEGORIES) {
      for (const phase of EMAIL_PHASES) {
        const s = sections[category][phase];
        expect(s).toMatchObject({category, phase});
        expect(sectionProblem(s)).toBeNull();
      }
    }
  });

  it('gives each level of a weather alert its own default guidance', () => {
    for (const category of EDITABLE_CATEGORIES) {
      const guidance = EMAIL_PHASES.map(
        (phase) => defaultSection(category, phase).guidance,
      );
      expect(new Set(guidance).size).toBe(EMAIL_PHASES.length);
    }
  });

  it('labels each phase', () => {
    expect(EMAIL_PHASES.map(phaseLabel)).toEqual([
      'Info',
      'Watch',
      'Warning',
      'Stand-down',
      'All clear',
    ]);
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
    const saved = section({category: 'uv', phase: 'warning', title: 'Sun'});
    const sections = mergeSections([saved]);
    expect(sections.uv.warning).toBe(saved);
    expect(sections.uv.watch).toEqual(defaultSection('uv', 'watch'));
    expect(sections.wind.warning).toEqual(defaultSection('wind', 'warning'));
  });

  it('skips saved sections without a known phase', () => {
    const unphased = {...section({title: 'Old'}), phase: undefined};
    const sections = mergeSections([unphased as unknown as EmailSection]);
    expect(sections).toEqual(defaultSections());
    expect(isEmailPhase('cleared')).toBe(true);
    expect(isEmailPhase('all')).toBe(false);
  });

  it('replaces one section without touching the others', () => {
    const before = defaultSections();
    const edited = section({phase: 'info', title: 'Breeze'});
    const after = withSection(before, edited);
    expect(after.wind.info).toBe(edited);
    expect(after.wind.watch).toBe(before.wind.watch);
    expect(before.wind.info.title).toBe('Wind gust');
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
    expect(sameSection(base, {...base, phase: 'info'})).toBe(false);
  });
});

describe('HTML alert email', () => {
  it('shows the section icon, level, place, details and guidance', () => {
    const {html} = composeEmail({
      kind: 'raised',
      alert: makeAlert({level: 'warning'}),
    });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('💨');
    expect(html).toContain('⚠️ Warning');
    expect(html).toContain('Brisbane (YBBN)');
    expect(html).toContain('Wind 20 kt, gusting 27 kt.');
    expect(html).toContain('27 kt');
    expect(html).toContain('2026-11-09 22:00 AEST / 12:00 UTC');
    expect(html).toContain('What to do');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href');
    expect(html).not.toContain('Open dashboard');
    expect(html).not.toContain('<svg');
  });

  it('labels an escalation in the headline', () => {
    const {html} = composeEmail({kind: 'escalated', alert: makeAlert()});
    expect(html).toContain('Wind gust escalated');
  });

  it.each([
    ['info', 'ℹ️ Info'],
    ['watch', '👁️ Watch'],
    ['standdown', '🛑 Stand-down'],
  ] as const)('marks a %s alert', (level, badge) => {
    const {html} = composeEmail({kind: 'raised', alert: makeAlert({level})});
    expect(html).toContain(badge);
  });

  it('writes an all-clear with its own section', () => {
    const sections = mergeSections([
      section({
        phase: 'cleared',
        icon: '✈️',
        title: 'Wind',
        guidance: 'Resume.',
      }),
    ]);
    const email = composeEmail(
      {
        kind: 'cleared',
        alert: makeAlert({status: 'cleared', peakLevel: 'warning'}),
      },
      sections,
    );
    expect(email.subject).toBe('[ALL CLEAR] Wind at Brisbane (YBBN)');
    expect(email.html).toContain('✅ All clear');
    expect(email.html).toContain('✈️');
    expect(email.html).toContain('Wind has cleared');
    expect(email.html).toContain('Conditions are back below alert levels.');
    expect(email.html).toContain('Warning');
    expect(email.html).toContain('Resume.');
    expect(email.text).toContain('What to do: Resume.');
  });

  it('writes an all-clear without guidance when it has none', () => {
    const email = composeEmail(
      {kind: 'cleared', alert: makeAlert({status: 'cleared'})},
      mergeSections([section({phase: 'cleared', guidance: ''})]),
    );
    expect(email.html).not.toContain('What to do');
    expect(email.text).not.toContain('What to do');
  });

  it.each(['info', 'watch', 'warning', 'standdown'] as const)(
    'uses the %s section for a %s alert',
    (level) => {
      const sections = mergeSections(
        EMAIL_PHASES.map((phase) =>
          section({phase, title: `Title ${phase}`, guidance: `Do ${phase}`}),
        ),
      );
      const email = composeEmail(
        {kind: 'raised', alert: makeAlert({level})},
        sections,
      );
      expect(email.subject).toContain(`Title ${level} 27 kt`);
      expect(email.text).toContain(`What to do: Do ${level}`);
    },
  );

  it('uses and escapes the edited section', () => {
    const sections = mergeSections([
      section({icon: '🚩', title: 'Gusts <b>', guidance: 'Tie "down" & go'}),
    ]);
    const email = composeEmail({kind: 'raised', alert: makeAlert()}, sections);
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
      mergeSections([section({guidance: 'One\nTwo'})]),
    );
    expect(email.html).toContain('One<br>Two');
    expect(email.text).toContain('What to do: One\nTwo');
  });

  it('is built for Outlook and light mode', () => {
    const {html} = composeEmail({kind: 'raised', alert: makeAlert()});
    expect(html).toContain(
      '<!--[if mso]><table role="presentation" width="600"',
    );
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
    expect(html).toContain('bgcolor="#fef3c7"');
    expect(html).toContain(
      '<meta name="supported-color-schemes" content="light">',
    );
    expect(html).not.toContain('display:inline-block;background');
  });

  it('hides the guidance box when the guidance is empty', () => {
    const email = composeEmail(
      {kind: 'raised', alert: makeAlert()},
      mergeSections([section({guidance: '  '})]),
    );
    expect(email.html).not.toContain('What to do');
    expect(email.text).not.toContain('What to do');
  });
});
