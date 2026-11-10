import {levelLabel} from './levels';
import {formatUtcAndAest} from './time';
import type {AlertEvent, AlertEventKind, AlertLevel} from './types';

/**
 * HTML email layout. Mail clients ignore <style> blocks, SVG and web fonts
 * unevenly, so this sticks to the safe subset: nested tables, inline styles,
 * system fonts, a 600px column and emoji for icons. Backgrounds are set as
 * both `bgcolor` and CSS, and the column is wrapped in an Outlook-only
 * fixed-width table, because desktop Outlook ignores max-width.
 */

/** Everything the layout needs, already resolved from the event. */
export interface EmailView {
  event: AlertEvent;
  /** e.g. "Brisbane (YBBN)". */
  place: string;
  title: string;
  icon: string;
  guidance: string;
  appUrl: string | null;
  disclaimer: string;
}

interface Tone {
  icon: string;
  label: string;
  background: string;
  border: string;
  text: string;
}

const LEVEL_TONES: Record<AlertLevel, Omit<Tone, 'label'>> = {
  info: {icon: 'ℹ️', background: '#e0f2fe', border: '#0284c7', text: '#075985'},
  watch: {
    icon: '👁️',
    background: '#fef3c7',
    border: '#d97706',
    text: '#78350f',
  },
  warning: {
    icon: '⚠️',
    background: '#ffedd5',
    border: '#ea580c',
    text: '#7c2d12',
  },
  standdown: {
    icon: '🛑',
    background: '#fee2e2',
    border: '#b91c1c',
    text: '#7f1d1d',
  },
};

const CLEARED_TONE: Tone = {
  icon: '✅',
  label: 'All clear',
  background: '#dcfce7',
  border: '#16a34a',
  text: '#14532d',
};

const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;";
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

/** Escapes text and keeps its line breaks as <br>. */
export function escapeMultiline(text: string): string {
  return text.split(/\r?\n/).map(escapeHtml).join('<br>');
}

/** Escapes text for use in HTML content and quoted attributes. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toneFor(event: AlertEvent): Tone {
  if (event.kind === 'cleared') return CLEARED_TONE;
  const level = event.alert.level;
  return {...LEVEL_TONES[level], label: levelLabel(level)};
}

const HEADLINE_SUFFIX: Record<AlertEventKind, string> = {
  raised: '',
  escalated: ' escalated',
  cleared: ' has cleared',
};

function headline(view: EmailView): string {
  return view.title + HEADLINE_SUFFIX[view.event.kind];
}

/** A table cell background that Outlook (bgcolor) and others (CSS) honour. */
function fill(color: string): string {
  return `bgcolor="${color}" style="background:${color};`;
}

function banner(view: EmailView, tone: Tone): string {
  return `<tr><td ${fill(tone.background)}border-left:6px solid ${tone.border};padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:40px;line-height:48px;padding-right:16px;vertical-align:middle;">${escapeHtml(view.icon)}</td>
<td style="vertical-align:middle;${FONT}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td ${fill(tone.border)}${FONT}color:#ffffff;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding:3px 8px;border-radius:4px;">${tone.icon} ${escapeHtml(tone.label)}</td></tr></table>
<div style="color:${tone.text};font-size:22px;font-weight:bold;line-height:28px;padding-top:6px;">${escapeHtml(headline(view))}</div>
<div style="color:${tone.text};font-size:15px;line-height:20px;">${escapeHtml(view.place)}</div>
</td></tr></table>
</td></tr>`;
}

function detailRows(view: EmailView): [string, string, string][] {
  const {alert} = view.event;
  if (view.event.kind === 'cleared') {
    return [
      ['✅', 'Cleared', formatUtcAndAest(alert.clearedAt ?? alert.updatedAt)],
      ['📈', 'Peak level', levelLabel(alert.peakLevel)],
      ['🕒', 'Started', formatUtcAndAest(alert.startedAt)],
    ];
  }
  return [
    ['📊', 'Reading', alert.triggerValue],
    ['📍', 'Airport', view.place],
    ['🕒', 'Started', formatUtcAndAest(alert.startedAt)],
    ['🔄', 'Updated', formatUtcAndAest(alert.updatedAt)],
  ];
}

function details(view: EmailView): string {
  const rows = detailRows(view)
    .map(
      ([icon, label, value]) =>
        `<tr><td style="${FONT}font-size:14px;color:${MUTED};padding:8px 0;border-bottom:1px solid ${LINE};width:130px;">${icon}&nbsp; ${escapeHtml(label)}</td>` +
        `<td style="${FONT}font-size:14px;color:${INK};font-weight:bold;padding:8px 0;border-bottom:1px solid ${LINE};">${escapeHtml(value)}</td></tr>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

function summary(view: EmailView): string {
  const text =
    view.event.kind === 'cleared'
      ? 'Conditions are back below alert levels.'
      : view.event.alert.message;
  return `<p style="${FONT}font-size:16px;line-height:24px;color:${INK};margin:0 0 16px;">${escapeHtml(text)}</p>`;
}

function guidanceBox(view: EmailView, tone: Tone): string {
  if (view.event.kind === 'cleared' || view.guidance === '') return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>
<td ${fill('#f8fafc')}border-left:4px solid ${tone.border};padding:14px 16px;${FONT}">
<div style="font-size:13px;font-weight:bold;color:${INK};text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">🦺 What to do</div>
<div style="font-size:15px;line-height:22px;color:${INK};">${escapeMultiline(view.guidance)}</div>
</td></tr></table>`;
}

function button(appUrl: string | null): string {
  if (appUrl === null) return '';
  const href = escapeHtml(appUrl);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
<td ${fill('#0284c7')}border-radius:6px;padding:12px 22px;">
<a href="${href}" style="display:inline-block;${FONT}font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">📊 Open dashboard</a>
</td></tr></table>`;
}

/** The full HTML document for an alert email. */
export function renderEmailHtml(view: EmailView): string {
  const tone = toneFor(view.event);
  const preheader =
    view.event.kind === 'cleared'
      ? `All clear: ${view.title} at ${view.place}.`
      : view.event.alert.message;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light;supported-color-schemes:light;}</style>
<title>${escapeHtml(view.title)}</title>
</head>
<body bgcolor="#f1f5f9" style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:8px;overflow:hidden;">
<tr><td ${fill('#0f172a')}padding:14px 24px;${FONT}font-size:15px;font-weight:bold;color:#ffffff;">🌤️ Airport Weather Alerts</td></tr>
${banner(view, tone)}
<tr><td style="padding:24px;">
${summary(view)}
${details(view)}
${guidanceBox(view, tone)}
${button(view.appUrl)}
</td></tr>
<tr><td ${fill('#f8fafc')}border-top:1px solid ${LINE};padding:16px 24px;${FONT}font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(view.disclaimer)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}
