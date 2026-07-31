import crypto from 'node:crypto';
import { env } from '../env';
import { prisma } from '../prisma';
import type { EmailTokenType, SubscriptionPlan } from '@prisma/client';

interface Mail {
  to: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  /** Sanitized HTML produced by Atlas itself, never raw caller input. */
  bodyHtml?: string;
  action?: { label: string; url: string };
  footer?: string;
}

interface NotificationEmail {
  to: string;
  recipientName: string;
  title: string;
  body: string | null | undefined;
  link?: { taskId?: string | null; entityType?: string | null; entityId?: string | null };
}

const appOrigin = () => env.APP_ORIGIN.replace(/\/+$/, '');

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

function emailHtml(input: Mail) {
  const action = input.action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:12px 18px;border-radius:3px;font-weight:600">${escapeHtml(input.action.label)}</a></p><p style="font-size:12px;color:#777;word-break:break-all">Or copy this link: ${escapeHtml(input.action.url)}</p>`
    : '';
  const body = input.bodyHtml ?? `<p style="white-space:pre-wrap">${escapeHtml(input.body)}</p>`;
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;color:#171717"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</div><main style="font-family:Arial,sans-serif;line-height:1.55;max-width:600px;margin:32px auto;background:#fff;border:1px solid #dedbd3;padding:36px"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#777">Atlas</p><h1 style="font-size:25px;line-height:1.15;margin:20px 0">${escapeHtml(input.heading)}</h1><div style="font-size:15px;line-height:1.65">${body}</div>${action}<hr style="border:0;border-top:1px solid #e6e3dc;margin:30px 0"><p style="font-size:12px;color:#777">${escapeHtml(input.footer ?? 'This is an automated message from Atlas.')}</p></main></body></html>`;
}

/** Small Markdown subset shared conceptually with the in-app preview. Input is escaped first. */
function renderBroadcastMarkdown(source: string): string {
  const inline = (value: string) =>
    value
      .replace(/`([^`]+)`/g, '<code style="background:#f1efe9;padding:2px 4px">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|\s)_([^_\n]+)_/g, '$1<em>$2</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" style="color:#315c47">$1</a>',
      );
  const lines = escapeHtml(source).split(/\r?\n/);
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  const flush = () => {
    if (paragraph.length)
      html.push(`<p style="margin:0 0 16px">${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      closeList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      closeList();
      const size = heading[1].length === 1 ? 21 : heading[1].length === 2 ? 18 : 16;
      html.push(
        `<h${heading[1].length + 1} style="font-size:${size}px;margin:24px 0 10px">${inline(heading[2])}</h${heading[1].length + 1}>`,
      );
      continue;
    }
    const quote = /^&gt;\s?(.*)$/.exec(line.trim());
    if (quote) {
      flush();
      closeList();
      html.push(
        `<blockquote style="border-left:3px solid #c8c4ba;margin:18px 0;padding:2px 0 2px 14px;color:#555">${inline(quote[1])}</blockquote>`,
      );
      continue;
    }
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ordered || unordered) {
      flush();
      const wanted = ordered ? 'ol' : 'ul';
      if (list !== wanted) {
        closeList();
        html.push(`<${wanted} style="margin:0 0 16px;padding-left:22px">`);
        list = wanted;
      }
      html.push(`<li style="margin:5px 0">${inline((ordered ?? unordered)![1])}</li>`);
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flush();
      closeList();
      html.push('<hr style="border:0;border-top:1px solid #dedbd3;margin:24px 0">');
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  closeList();
  return html.join('');
}

export async function sendBroadcastEmails(input: {
  recipients: { email: string }[];
  title: string;
  body: string;
  broadcastId: string;
}) {
  if (!env.emailEnabled) return { sent: 0, failed: input.recipients.length, configured: false };
  const bodyHtml = renderBroadcastMarkdown(input.body);
  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < input.recipients.length; offset += 100) {
    const recipients = input.recipients.slice(offset, offset + 100);
    const message: Mail = {
      to: '',
      subject: input.title,
      preheader: input.body.replace(/[#*_>`[\]]/g, '').slice(0, 140),
      heading: input.title,
      body: input.body,
      bodyHtml,
      action: { label: 'Open Atlas', url: appOrigin() },
      footer: 'This platform announcement was sent to every Atlas account.',
    };
    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Atlas/1.0',
          'Idempotency-Key': `platform-broadcast/${input.broadcastId}/${offset / 100}`,
        },
        body: JSON.stringify(
          recipients.map((recipient) => ({
            from: env.EMAIL_FROM,
            reply_to: env.EMAIL_REPLY_TO || undefined,
            to: [recipient.email],
            subject: input.title,
            text: `${input.title}\n\n${input.body}\n\nOpen Atlas: ${appOrigin()}`,
            html: emailHtml(message),
          })),
        ),
      });
      if (response.ok) sent += recipients.length;
      else {
        failed += recipients.length;
        console.error(`Atlas could not send broadcast batch (${response.status}).`);
      }
    } catch (error) {
      failed += recipients.length;
      console.error('Atlas could not send broadcast batch.', error);
    }
  }
  return { sent, failed, configured: true };
}

/** Best-effort delivery. Product actions never roll back because an email provider is unavailable. */
export async function sendEmail(input: Mail): Promise<boolean> {
  if (!env.emailEnabled || input.to.endsWith('@placeholder.atlas.invalid')) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        reply_to: env.EMAIL_REPLY_TO || undefined,
        to: [input.to],
        subject: input.subject,
        text: [
          input.heading,
          '',
          input.body,
          input.action ? `\n${input.action.label}: ${input.action.url}` : '',
          '',
          input.footer ?? 'This is an automated message from Atlas.',
        ].join('\n'),
        html: emailHtml(input),
      }),
    });
    if (!response.ok) {
      console.error(`Atlas could not send email (${response.status}).`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Atlas could not send email.', error);
    return false;
  }
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createEmailToken(userId: string, type: EmailTokenType, lifetimeMs: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.emailToken.deleteMany({ where: { userId, type } }),
    prisma.emailToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + lifetimeMs),
      },
    }),
  ]);
  return token;
}

/** Creates a human-friendly one-use code without storing the code itself. */
export async function createEmailVerificationCode(userId: string) {
  // A token hash is globally unique. Retry the very unlikely case where two
  // active users receive the same six-digit code at once.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    try {
      await prisma.$transaction([
        prisma.emailToken.deleteMany({ where: { userId, type: 'VERIFY_EMAIL' } }),
        prisma.emailToken.create({
          data: {
            userId,
            type: 'VERIFY_EMAIL',
            tokenHash: hashToken(code),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        }),
      ]);
      return code;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error('Could not create an email verification code.');
}

export async function consumeEmailToken(rawToken: string, type: EmailTokenType) {
  const record = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!record || record.type !== type || record.usedAt || record.expiresAt <= new Date())
    return null;
  const claimed = await prisma.emailToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? record.user : null;
}

export async function consumeEmailTokenForUser(
  rawToken: string,
  type: EmailTokenType,
  userId: string,
) {
  const record = await prisma.emailToken.findFirst({
    where: { tokenHash: hashToken(rawToken), type, userId },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  const claimed = await prisma.emailToken.updateMany({
    where: { id: record.id, userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? record.user : null;
}

export async function sendVerificationEmail(user: { id: string; email: string; fullName: string }) {
  const code = await createEmailVerificationCode(user.id);
  return sendEmail({
    to: user.email,
    subject: `${code} is your Atlas verification code`,
    preheader: `Your Atlas verification code is ${code}.`,
    heading: 'Verify your email.',
    body: `Hi ${user.fullName}, enter this code in Atlas to finish creating your account:\n\n${code}\n\nThe code expires in 10 minutes and can only be used once.`,
    footer: 'If you did not create this account, you can ignore this message.',
  });
}

export async function sendPasswordResetEmail(user: {
  id: string;
  email: string;
  fullName: string;
}) {
  const token = await createEmailToken(user.id, 'RESET_PASSWORD', 60 * 60 * 1000);
  return sendEmail({
    to: user.email,
    subject: 'Reset your Atlas password',
    preheader: 'Your password-reset link expires in one hour.',
    heading: 'Reset your password.',
    body: `Hi ${user.fullName}, we received a request to reset your Atlas password. The link expires in one hour and can only be used once.`,
    action: { label: 'Reset password', url: `${appOrigin()}/reset-password?token=${token}` },
    footer:
      'If you did not request this, your password has not changed and you can ignore this message.',
  });
}

export function sendWelcomeEmail(user: { email: string; fullName: string }) {
  return sendEmail({
    to: user.email,
    subject: 'Welcome to Atlas',
    preheader: 'Your personal Atlas account is ready.',
    heading: 'Your Atlas account is ready.',
    body: `Hi ${user.fullName}, your personal account has been created. You can explore Atlas and update account settings now. Choose a plan only when you are ready to build a company panel.`,
    action: { label: 'Open Atlas', url: appOrigin() },
  });
}

export function sendSecurityEmail(
  user: { email: string; fullName: string },
  heading: string,
  body: string,
) {
  return sendEmail({
    to: user.email,
    subject: heading,
    preheader: body,
    heading,
    body: `Hi ${user.fullName}, ${body}`,
    action: { label: 'Review account settings', url: `${appOrigin()}/account-settings` },
    footer: 'If you did not make this change, reset your password and contact Atlas support.',
  });
}

export function sendSubscriptionEmail(
  user: { email: string; fullName: string },
  plan: SubscriptionPlan | null,
  active: boolean,
) {
  return sendEmail({
    to: user.email,
    subject: active ? `Your Atlas ${plan} plan is active` : 'Your Atlas subscription changed',
    preheader: active ? 'Your plan is ready.' : 'Your paid plan is no longer active.',
    heading: active ? 'Your plan is ready.' : 'Your subscription was removed.',
    body: active
      ? `Hi ${user.fullName}, your ${plan} plan is active. You can now set up or open your company panel.`
      : `Hi ${user.fullName}, your Atlas account remains available, but paid company-panel access has been removed. Your saved panel data has not been deleted.`,
    action: {
      label: active ? 'Continue to Atlas' : 'View plans',
      url: `${appOrigin()}/explore/pricing`,
    },
  });
}

export function sendInvitationEmail(input: {
  to: string;
  inviterName: string;
  companyName: string;
  code: string;
}) {
  return sendEmail({
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.companyName} on Atlas`,
    preheader: `Join ${input.companyName} with your private invitation.`,
    heading: `You’re invited to ${input.companyName}.`,
    body: `${input.inviterName} invited you to join their company panel on Atlas. Your invitation code is ${input.code}.`,
    action: {
      label: 'Accept invitation',
      url: `${appOrigin()}/join?code=${encodeURIComponent(input.code)}`,
    },
    footer: 'Only use this invitation if you recognize the company and sender.',
  });
}

export async function sendContactEmails(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  if (!env.SUPPORT_EMAIL) return false;
  const delivered = await sendEmail({
    to: env.SUPPORT_EMAIL,
    subject: `[Atlas contact] ${input.subject}`,
    preheader: `New message from ${input.name}.`,
    heading: input.subject,
    body: `From: ${input.name} <${input.email}>\n\n${input.message}`,
    footer: `Reply directly to ${input.email}.`,
  });
  if (delivered) {
    void sendEmail({
      to: input.email,
      subject: 'We received your Atlas message',
      preheader: 'Your message reached Atlas.',
      heading: 'Your message is with us.',
      body: `Hi ${input.name}, thanks for contacting Atlas about “${input.subject}.” We received your message and will reply as soon as we can.`,
      action: { label: 'Return to Atlas', url: appOrigin() },
    });
  }
  return delivered;
}

function targetPath(link: NotificationEmail['link']): string | null {
  if (!link) return null;
  if (link.taskId) return `/app/work?task=${encodeURIComponent(link.taskId)}`;
  if (link.entityType === 'task' && link.entityId)
    return `/app/work?task=${encodeURIComponent(link.entityId)}`;
  if (link.entityType === 'document' && link.entityId)
    return `/app/knowledge/${encodeURIComponent(link.entityId)}`;
  if (link.entityType === 'person' && link.entityId)
    return `/app/people?person=${encodeURIComponent(link.entityId)}`;
  if (link.entityType === 'team') return '/app/organization';
  if (link.entityType === 'announcement') return '/app/home';
  return null;
}

export async function sendNotificationEmail(input: NotificationEmail) {
  const path = targetPath(input.link);
  const url = path ? `${appOrigin()}${path}` : appOrigin();
  await sendEmail({
    to: input.to,
    subject: `[Atlas] ${input.title}`,
    preheader: input.body ?? 'There is an update waiting in Atlas.',
    heading: input.title,
    body: `Hi ${input.recipientName},\n\n${input.body?.trim() || 'Open Atlas to see the details.'}`,
    action: { label: path ? 'Open it in Atlas' : 'Open Atlas', url },
    footer: `You can turn notification email off in Atlas account settings: ${appOrigin()}/app/account`,
  });
}
