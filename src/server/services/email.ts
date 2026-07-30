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
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;color:#171717"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</div><main style="font-family:Arial,sans-serif;line-height:1.55;max-width:600px;margin:32px auto;background:#fff;border:1px solid #dedbd3;padding:36px"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#777">Atlas</p><h1 style="font-size:25px;line-height:1.15;margin:20px 0">${escapeHtml(input.heading)}</h1><p style="white-space:pre-wrap">${escapeHtml(input.body)}</p>${action}<hr style="border:0;border-top:1px solid #e6e3dc;margin:30px 0"><p style="font-size:12px;color:#777">${escapeHtml(input.footer ?? 'This is an automated message from Atlas.')}</p></main></body></html>`;
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

export async function sendVerificationEmail(user: { id: string; email: string; fullName: string }) {
  const token = await createEmailToken(user.id, 'VERIFY_EMAIL', 24 * 60 * 60 * 1000);
  return sendEmail({
    to: user.email,
    subject: 'Verify your Atlas email',
    preheader: 'Confirm this email belongs to you.',
    heading: `Welcome, ${user.fullName}.`,
    body: 'Confirm your email address to finish securing your Atlas account. This link expires in 24 hours.',
    action: { label: 'Verify email', url: `${appOrigin()}/verify-email?token=${token}` },
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
