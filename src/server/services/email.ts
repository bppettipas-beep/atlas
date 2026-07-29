import { env } from '../env';

interface NotificationEmail {
  to: string;
  recipientName: string;
  title: string;
  body: string | null | undefined;
  /** Enough to point the email at the thing that actually happened. */
  link?: {
    taskId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  };
}

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

/**
 * Where the email should send them.
 *
 * Deliberately the same mapping the notification bell uses in
 * `NotificationCenter.tsx`, so an email and a click on the bell land on the
 * same screen. An email that only says "open Atlas" makes the reader go and
 * find the thing themselves, which is most of the reason people stop opening
 * notification email at all.
 */
function targetPath(link: NotificationEmail['link']): string | null {
  if (!link) return null;
  if (link.taskId) return `/app/work?task=${encodeURIComponent(link.taskId)}`;
  if (link.entityType === 'task' && link.entityId) {
    return `/app/work?task=${encodeURIComponent(link.entityId)}`;
  }
  if (link.entityType === 'document' && link.entityId) {
    return `/app/knowledge/${encodeURIComponent(link.entityId)}`;
  }
  if (link.entityType === 'person' && link.entityId) {
    return `/app/people?person=${encodeURIComponent(link.entityId)}`;
  }
  if (link.entityType === 'team') return '/app/organization';
  if (link.entityType === 'announcement') return '/app/home';
  return null;
}

/**
 * Deliver the email copy of an in-app notification.
 *
 * Resend's HTTPS API keeps mail transport configuration out of Atlas and is
 * intentionally called only after the notification has been committed. A mail
 * provider outage can therefore never lose or block the notification itself.
 *
 * This never throws and never rejects: callers treat email as a side effect of
 * a notification, not as part of the work the request was asked to do.
 */
export async function sendNotificationEmail(input: NotificationEmail) {
  // A placeholder has no real mailbox, so sending would only earn Atlas a hard
  // bounce against its sending domain.
  if (!env.emailEnabled || input.to.endsWith('@placeholder.atlas.invalid')) return;

  try {
    const title = escapeHtml(input.title);
    const body = input.body?.trim();
    const safeBody = body ? escapeHtml(body) : 'Open Atlas to see the details.';
    const appUrl = env.APP_ORIGIN.replace(/\/+$/, '');
    const path = targetPath(input.link);
    const deepLink = path ? `${appUrl}${path}` : appUrl;
    const linkLabel = path ? 'Open it in Atlas' : 'Open Atlas';
    const settingsUrl = `${appUrl}/app/account`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.to],
        subject: `[Atlas] ${input.title}`,
        text: [
          input.title,
          '',
          body ?? 'Open Atlas to see the details.',
          '',
          `${linkLabel}: ${deepLink}`,
          '',
          `Turn these emails off: ${settingsUrl}`,
        ].join('\n'),
        html: `<main style="font-family:Arial,sans-serif;color:#171717;line-height:1.5;max-width:600px;margin:auto"><p>Hi ${escapeHtml(input.recipientName)},</p><h1 style="font-size:20px">${title}</h1><p style="white-space:pre-wrap">${safeBody}</p><p><a href="${escapeHtml(deepLink)}">${linkLabel}</a></p><hr style="border:none;border-top:1px solid #e6e4e0;margin:24px 0"><p style="font-size:12px;color:#8a877f">You are receiving this because you have notification email switched on in Atlas. <a href="${escapeHtml(settingsUrl)}" style="color:#8a877f">Turn these emails off</a>.</p></main>`,
      }),
    });
    if (!response.ok) {
      console.error(`Atlas could not send notification email (${response.status}).`);
    }
  } catch (error) {
    console.error('Atlas could not send notification email.', error);
  }
}
