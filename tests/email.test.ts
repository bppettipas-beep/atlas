import { describe, expect, it } from 'vitest';
import { renderEmailHtml } from '../src/server/services/email';

describe('Atlas email design', () => {
  it('renders a minimal responsive verification email and escapes user content', () => {
    const html = renderEmailHtml({
      to: 'person@example.com',
      subject: 'Verify <Atlas>',
      preheader: 'Your code is ready.',
      heading: 'Verify your email.',
      body: 'Hi <script>alert(1)</script>, finish creating your account.\n\nIt expires soon.',
      code: '482913',
      footer: 'Ignore this message if you did not sign up.',
    });

    expect(html).toContain('name="viewport"');
    expect(html).toContain('max-width:560px');
    expect(html).toContain('letter-spacing:8px');
    expect(html).toContain('482913');
    expect(html).toContain('Verify &lt;Atlas&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders a high-contrast action with a safe fallback link', () => {
    const html = renderEmailHtml({
      to: 'person@example.com',
      subject: 'Reset password',
      preheader: 'Reset your password.',
      heading: 'Reset your password.',
      body: 'Use the secure link below.',
      action: {
        label: 'Reset password',
        url: 'https://atlasworkmap.com/reset-password?token=a&return=<home>',
      },
    });

    expect(html).toContain('bgcolor="#191919"');
    expect(html).toContain('color:#ffffff');
    expect(html).toContain('Copy this link');
    expect(html).toContain('token=a&amp;return=&lt;home&gt;');
  });
});
