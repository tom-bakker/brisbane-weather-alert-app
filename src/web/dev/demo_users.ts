import {
  ROLE_INFO,
  type AppUser,
  type UserAuditAction,
  type UserAuditEntry,
  type UserRole,
} from '../../domain/users';
import type {DataApi} from '../data/api';

/** In-memory users and user audit for the local demo. */

const ME = 'demo@example.com';

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

type UserMethods = Pick<
  DataApi,
  | 'listUsers'
  | 'inviteUser'
  | 'resetUserPassword'
  | 'resetUserMfa'
  | 'setUserRole'
  | 'removeUser'
  | 'loadUserAudit'
>;

export function createDemoUsers(): UserMethods {
  let nextId = 100;
  const users: AppUser[] = [
    {
      id: 'u1',
      email: ME,
      role: 'admin',
      invitedAt: ago(60 * 24 * 40),
      emailConfirmed: true,
      mfaEnrolled: true,
      lastSignInAt: ago(2),
    },
    {
      id: 'u2',
      email: 'sam.nguyen@example.com',
      role: 'power_user',
      invitedAt: ago(60 * 24 * 12),
      emailConfirmed: true,
      mfaEnrolled: true,
      lastSignInAt: ago(60 * 26),
    },
    {
      id: 'u3',
      email: 'ramp.lead@example.com',
      role: 'power_user',
      invitedAt: ago(60 * 3),
      emailConfirmed: true,
      mfaEnrolled: false,
      lastSignInAt: ago(60 * 2),
    },
    {
      id: 'u4',
      email: 'ops-manager@example.com',
      role: 'admin',
      invitedAt: ago(30),
      emailConfirmed: false,
      mfaEnrolled: false,
      lastSignInAt: null,
    },
  ];
  const audit: UserAuditEntry[] = [];

  function record(
    action: UserAuditAction,
    targetEmail: string,
    detail: string,
    minutesAgo = 0,
    actorEmail: string | null = ME,
  ) {
    audit.unshift({
      id: nextId++,
      occurredAt: ago(minutesAgo),
      action,
      actorEmail,
      targetEmail,
      detail,
    });
  }

  record(
    'user_invited',
    'sam.nguyen@example.com',
    'Invited as Power user',
    60 * 24 * 12,
  );
  record(
    'email_confirmed',
    'sam.nguyen@example.com',
    'Accepted the invitation',
    60 * 24 * 12 - 20,
    'sam.nguyen@example.com',
  );
  record(
    'password_changed',
    'sam.nguyen@example.com',
    'Set their first password',
    60 * 24 * 12 - 21,
    'sam.nguyen@example.com',
  );
  record(
    'user_removed',
    'old.contractor@example.com',
    'Account deleted',
    60 * 24 * 5,
  );
  record(
    'user_invited',
    'ramp.lead@example.com',
    'Invited as Power user',
    60 * 3,
  );
  record(
    'email_confirmed',
    'ramp.lead@example.com',
    'Accepted the invitation',
    60 * 2,
    'ramp.lead@example.com',
  );
  record(
    'password_reset_sent',
    'sam.nguyen@example.com',
    'Password reset email sent',
    90,
  );
  record('user_invited', 'ops-manager@example.com', 'Invited as Admin', 30);

  function find(id: string): AppUser {
    const user = users.find((u) => u.id === id);
    if (user === undefined) throw new Error('Unknown user.');
    return user;
  }

  const pause = () => new Promise((r) => setTimeout(r, 400));

  return {
    listUsers: async () => users.map((u) => ({...u})),
    async inviteUser(email, role: UserRole) {
      await pause();
      if (users.some((u) => u.email === email.toLowerCase())) {
        throw new Error('That email already has an account.');
      }
      users.push({
        id: `u${nextId++}`,
        email: email.toLowerCase(),
        role,
        invitedAt: ago(0),
        emailConfirmed: false,
        mfaEnrolled: false,
        lastSignInAt: null,
      });
      record('user_invited', email, `Invited as ${ROLE_INFO[role].label}`);
    },
    async resetUserPassword(id) {
      await pause();
      record(
        'password_reset_sent',
        find(id).email,
        'Password reset email sent',
      );
    },
    async resetUserMfa(id) {
      await pause();
      const user = find(id);
      user.mfaEnrolled = false;
      record(
        'mfa_reset',
        user.email,
        'Authenticator removed; set up again at next sign-in',
      );
    },
    async setUserRole(id, role) {
      await pause();
      const user = find(id);
      user.role = role;
      record(
        'role_changed',
        user.email,
        `Role set to ${ROLE_INFO[role].label}`,
      );
    },
    async removeUser(id) {
      await pause();
      const user = find(id);
      users.splice(users.indexOf(user), 1);
      record('user_removed', user.email, 'Account deleted');
    },
    async loadUserAudit({action, page, pageSize}) {
      const rows = audit.filter((r) => action === 'all' || r.action === action);
      return {
        rows: rows.slice(page * pageSize, (page + 1) * pageSize),
        total: rows.length,
      };
    },
  };
}
