import nodemailer from 'nodemailer';
import type {Mailer, OutgoingEmail} from './ports';

/** Keeps each message well under Gmail's per-message recipient limit. */
export const MAX_BCC_PER_MESSAGE = 50;

export interface GmailOptions {
  user: string;
  appPassword: string;
  fromName: string;
}

/** Splits a recipient list into chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sends through Gmail SMTP (smtp.gmail.com:465, implicit TLS) with a Google
 * app password. The account must have 2-Step Verification on. Recipients go
 * in Bcc; the message is addressed to the sending account itself.
 */
export function createGmailMailer(options: GmailOptions): Mailer {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {user: options.user, pass: options.appPassword},
  });
  const from = {name: options.fromName, address: options.user};

  return {
    async send(email: OutgoingEmail): Promise<void> {
      for (const bcc of chunk(email.bcc, MAX_BCC_PER_MESSAGE)) {
        await transport.sendMail({
          from,
          to: options.user,
          bcc,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
    },
  };
}
