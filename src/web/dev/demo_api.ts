import {
  defaultSection,
  defaultSections,
  withSection,
} from '../../domain/email_sections';
import {DEFAULT_THRESHOLDS} from '../../domain/thresholds';
import type {
  AlertRecord,
  EmailAuditEntry,
  ForecastHour,
  MailGroup,
} from '../../domain/types';
import type {AuditPage, AuthStep, DashboardData, DataApi} from '../data/api';
import {createDemoUsers} from './demo_users';

/**
 * Sample data for running the UI locally without Supabase (`npm run dev`
 * with no VITE_SUPABASE_* set). Only loaded in development builds.
 */

const SYMBOLS = [
  'partlycloudy_night',
  'cloudy',
  'lightrainshowers_night',
  'rainshowersandthunder_night',
  'fog',
  'clearsky_night',
  'fair_day',
  'partlycloudy_day',
  'clearsky_day',
  'lightrain',
  'heavyrain',
  'rainshowers_day',
];

function hoursFrom(start: Date, baseTemp: number): ForecastHour[] {
  return SYMBOLS.map((symbol, i) => ({
    time: new Date(start.getTime() + i * 3_600_000).toISOString(),
    tempC: baseTemp + Math.round(Math.sin(i / 2) * 3),
    windKt: 6 + ((i * 5) % 18),
    windDirDeg: (60 + i * 15) % 360,
    precipMm: symbol.includes('rain') ? Math.round(4 + i) / 10 : 0,
    uvIndex: symbol.endsWith('_day') ? Math.min(11, i) : 0,
    symbol,
  }));
}

function alert(overrides: Partial<AlertRecord>): AlertRecord {
  const at = new Date(Date.now() - 35 * 60_000).toISOString();
  return {
    id: 'demo-alert',
    airport: 'YBBN',
    category: 'wind',
    level: 'watch',
    peakLevel: 'watch',
    status: 'active',
    triggerValue: '27 kt',
    message: 'Wind 20 kt, gusting 27 kt.',
    startedAt: at,
    updatedAt: at,
    clearedAt: null,
    belowSince: null,
    ...overrides,
  };
}

function dashboard(): DashboardData {
  const now = new Date();
  const hourStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const minsAgo = (m: number) =>
    new Date(now.getTime() - m * 60_000).toISOString();
  return {
    airports: [
      {
        code: 'YBBN',
        observation: {
          airport: 'YBBN',
          observedAt: minsAgo(8),
          rawMetar:
            'METAR YBBN 101030Z 07022G38KT 9999 -SHRA SCT025 BKN040 24/19 Q1012',
          windDirDeg: 70,
          windKt: 22,
          gustKt: 38,
          gustObservedAt: minsAgo(2),
          visibilityM: 10000,
          weatherCodes: '-SHRA',
          cloud: 'SCT025 BKN040',
          tempC: 24,
          dewpointC: 19,
          qnhHpa: 1012,
          apparentTempC: 25,
          uvIndex: 9,
        },
        forecast: {
          airport: 'YBBN',
          issuedAt: minsAgo(50),
          rawTaf:
            'TAF YBBN 100900Z 1010/1112 07015G28KT 9999 SHRA SCT025\nTEMPO 1012/1016 4000 TSRA BKN015',
          hours: hoursFrom(hourStart, 23),
          hoursFetchedAt: minsAgo(20),
        },
        alerts: [
          alert({
            id: 'a1',
            level: 'warning',
            triggerValue: '38 kt',
            message: 'Wind 22 kt, gusting 38 kt. Secure loose equipment.',
          }),
          alert({
            id: 'a2',
            category: 'uv',
            triggerValue: 'UV 9',
            message: 'UV very high. Sun protection required outdoors.',
          }),
        ],
        warnings: [
          {
            id: 'w1',
            airport: 'YBBN',
            kind: 'thunderstorm',
            level: 'watch',
            headline:
              'Severe Thunderstorm Warning for damaging winds for Southeast Coast',
            issuedAt: minsAgo(40),
            expiresAt: null,
          },
        ],
      },
      {
        code: 'YBCS',
        observation: {
          airport: 'YBCS',
          observedAt: minsAgo(12),
          rawMetar: 'METAR YBCS 101030Z 12008KT 9999 FEW030 29/22 Q1009',
          windDirDeg: 120,
          windKt: 8,
          gustKt: null,
          gustObservedAt: null,
          visibilityM: 10000,
          weatherCodes: '',
          cloud: 'FEW030',
          tempC: 29,
          dewpointC: 22,
          qnhHpa: 1009,
          apparentTempC: 32,
          uvIndex: 4,
        },
        forecast: {
          airport: 'YBCS',
          issuedAt: minsAgo(50),
          rawTaf: 'TAF YBCS 100900Z 1010/1112 12010KT 9999 FEW030',
          hours: hoursFrom(hourStart, 28),
          hoursFetchedAt: minsAgo(20),
        },
        alerts: [],
        warnings: [],
      },
    ],
    feeds: [
      {
        source: 'aviationweather.metar',
        ok: true,
        records: 2,
        error: null,
        runAt: minsAgo(3),
      },
      {
        source: 'aviationweather.taf',
        ok: true,
        records: 2,
        error: null,
        runAt: minsAgo(3),
      },
      {
        source: 'bom.warnings',
        ok: false,
        records: 0,
        error: 'FTP timeout',
        runAt: minsAgo(3),
      },
      {source: 'met.no', ok: true, records: 2, error: null, runAt: minsAgo(20)},
    ],
  };
}

const GROUPS: MailGroup[] = [
  {
    id: 'g1',
    name: 'Ramp supervisors',
    enabled: true,
    airports: ['YBBN', 'YBCS'],
    categories: ['wind', 'thunderstorm'],
    minLevel: 'watch',
    members: [{id: 'm1', email: 'ramp@example.com'}],
  },
];

function history(): AlertRecord[] {
  const yesterday = new Date(Date.now() - 26 * 3_600_000).toISOString();
  const cleared = new Date(Date.now() - 22 * 3_600_000).toISOString();
  return [
    ...dashboard().airports.flatMap((a) => a.alerts),
    alert({
      id: 'h1',
      airport: 'YBCS',
      category: 'thunderstorm',
      level: 'info',
      peakLevel: 'warning',
      status: 'cleared',
      triggerValue: 'TSRA',
      message: 'Thunderstorm reported at the aerodrome.',
      startedAt: yesterday,
      updatedAt: cleared,
      clearedAt: cleared,
    }),
  ];
}

function auditRow(
  id: number,
  overrides: Partial<EmailAuditEntry> = {},
): EmailAuditEntry {
  return {
    id,
    sentAt: new Date(Date.now() - id * 40 * 60_000).toISOString(),
    groupId: 'g1',
    groupName: 'Ramp supervisors',
    recipients: ['ramp@example.com', 'ops@example.com'],
    subject: 'WARNING: Brisbane wind gust 38 kt',
    body: 'Wind 22 kt, gusting 38 kt. Secure loose equipment.',
    alertId: 'a1',
    airport: 'YBBN',
    category: 'wind',
    level: 'warning',
    event: 'raised',
    status: 'sent',
    error: null,
    resendOf: null,
    ...overrides,
  };
}

const AUDIT: EmailAuditEntry[] = [
  auditRow(1),
  auditRow(2, {
    subject: 'WATCH: Brisbane UV 9',
    status: 'failed',
    error: 'SMTP 454 quota exceeded',
  }),
  auditRow(3, {subject: 'CLEARED: Cairns thunderstorm', event: 'cleared'}),
];

/** A read-mostly DataApi over the sample data above. */
export function createDemoApi(): DataApi {
  const step: AuthStep = {
    kind: 'signed_in',
    email: 'demo@example.com',
    role: 'admin',
  };
  const noop = async () => {};
  let sections = defaultSections();
  let thresholds = DEFAULT_THRESHOLDS;
  return {
    authStep: async () => step,
    onAuthChange: () => () => {},
    signIn: noop,
    signOut: noop,
    enrolMfa: async () => ({factorId: 'f', qrCode: '', secret: ''}),
    verifyMfa: noop,
    setPassword: noop,
    loadDashboard: async () => dashboard(),
    loadAlertHistory: async () => history(),
    refreshFeeds: () => new Promise((r) => setTimeout(r, 800)),
    listGroups: async () => GROUPS,
    createGroup: noop,
    updateGroup: noop,
    deleteGroup: noop,
    addMember: noop,
    removeMember: noop,
    loadAudit: async (): Promise<AuditPage> => ({
      rows: AUDIT,
      total: AUDIT.length,
    }),
    resendEmail: noop,
    loadEmailSections: async () => sections,
    saveEmailSection: async (section) => {
      sections = withSection(sections, section);
    },
    resetEmailSection: async (category, phase) => {
      sections = withSection(sections, defaultSection(category, phase));
    },
    loadThresholds: async () => thresholds,
    saveThresholds: async ({category, limits}) => {
      thresholds = {...thresholds, [category]: limits};
    },
    resetThresholds: async (category) => {
      thresholds = {...thresholds, [category]: DEFAULT_THRESHOLDS[category]};
    },
    ...createDemoUsers(),
  };
}
