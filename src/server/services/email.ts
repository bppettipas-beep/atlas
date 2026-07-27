import { env } from '../env';

interface NotificationEmail {
  to: string;
  recipientName: string;
  title: string;
  body: string | null | undefined;
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
 * Deliver the email copy of an in-app notification.
 *
 * Resend's HTTPS API keeps mail transport configuration out of Atlas and is
 * intentionally called only after the notification has been committed. A mail
 * provider outage can therefore never lose or block the notification itself.
 */
export async function sendNotificationEmail(input: NotificationEmail) {
  if (!env.emailEnabled || input.to.endsWith('@placeholder.atlas.invalid')) return;

  const title = escapeHtml(input.title);
  const body = input.body?.trim();
  const safeBody = body ? escapeHtml(body) : 'Open Atlas to see the details.';
  const appUrl = env.APP_ORIGIN.replace(/\/+$/, '');

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
        to: [input.to],
        subject: `[Atlas] ${input.title}`,
        text: `${input.title}\n\n${body ?? 'Open Atlas to see the details.'}\n\nOpen Atlas: ${appUrl}`,
        html: `<main style="font-family:Arial,sans-serif;color:#171717;line-height:1.5;max-width:600px;margin:auto"><p>Hi ${escapeHtml(input.recipientName)},</p><h1 style="font-size:20px">${title}</h1><p style="white-space:pre-wrap">${safeBody}</p><p><a href="${escapeHtml(appUrl)}">Open Atlas</a></p></main>`,
      }),
    });
    if (!response.ok) {
      console.error(`Atlas could not send notification email (${response.status}).`);
    }
  } catch (error) {
    console.error('Atlas could not send notification email.', error);
  }
}
