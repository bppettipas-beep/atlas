import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, Notice, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.post('/contact', form);
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthLayout
      sheet="Contact Atlas"
      drawingNo="C-01"
      title="How can we help?"
      description="Send a message to the Atlas team. A confirmation will be sent to your email."
      footer={
        <Link to="/" className="underline underline-offset-4">
          Back to Atlas
        </Link>
      }
    >
      {sent ? (
        <Notice>
          <strong>Message received.</strong> Check your inbox for confirmation.
        </Notice>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && <InlineError message={error} />}
          <input
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
            aria-hidden
          />
          <Field label="Name" htmlFor="contact-name" required>
            <Input
              id="contact-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </Field>
          <Field label="Email" htmlFor="contact-email" required>
            <Input
              id="contact-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </Field>
          <Field label="Subject" htmlFor="contact-subject" required>
            <Input
              id="contact-subject"
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              required
            />
          </Field>
          <Field label="Message" htmlFor="contact-message" required>
            <Textarea
              id="contact-message"
              rows={6}
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              required
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center"
            loading={sending}
          >
            Send message
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
