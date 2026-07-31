import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ShieldCheck } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { Button, Field, Input, LoadingState } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { SUBSCRIPTION_PLANS, type SubscriptionPlanKey } from '@shared/plans';

const PLAN_DETAILS: Record<
  SubscriptionPlanKey,
  { name: string; price: string; amount: string; capacity: string; highlights: string[] }
> = {
  STARTER: {
    name: 'Starter',
    price: '$19',
    amount: '$19.00',
    capacity: 'Up to 10 employees',
    highlights: ['Core work management', 'People and organization map'],
  },
  GROWTH: {
    name: 'Growth',
    price: '$49',
    amount: '$49.00',
    capacity: 'Up to 50 employees',
    highlights: ['Atlasy AI', 'Scheduling, knowledge, and reporting'],
  },
  BUSINESS: {
    name: 'Business',
    price: '$99',
    amount: '$99.00',
    capacity: 'Up to 150 employees',
    highlights: ['Advanced permissions and analytics', 'API access and priority support'],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 'Custom',
    amount: 'Custom quote',
    capacity: 'Flexible company scale',
    highlights: ['Tailored onboarding', 'Priority support and custom pricing'],
  },
};

const PAYMENT_METHODS = [
  'Card',
  'PayPal',
  'Apple Pay',
  'Google Pay',
  'Bank',
  'Cash App',
  'Klarna',
] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
}

export function MockCheckoutPage() {
  const { account, loading } = useAuth();
  const [params] = useSearchParams();
  const requestedPlan = params.get('plan')?.toUpperCase();
  const plan = SUBSCRIPTION_PLANS.find((candidate) => candidate === requestedPlan);
  const [method, setMethod] = useState<PaymentMethod>('Card');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [email, setEmail] = useState('');
  const [processing, setProcessing] = useState(false);

  if (loading) return <LoadingState className="min-h-[100dvh]" label="Preparing checkout" />;
  if (!account) {
    return <Navigate to={plan ? `/signup/owner?plan=${plan}` : '/explore/pricing'} replace />;
  }
  if (!account.user.emailVerified) {
    return (
      <Navigate
        to={`/verify-email?next=${encodeURIComponent(`/checkout?plan=${plan ?? ''}`)}`}
        replace
      />
    );
  }
  if (!plan) return <Navigate to="/explore/pricing" replace />;

  const details = PLAN_DETAILS[plan];
  const currentPlanIndex = account.plan ? SUBSCRIPTION_PLANS.indexOf(account.plan) : -1;
  if (currentPlanIndex >= SUBSCRIPTION_PLANS.indexOf(plan)) {
    return <Navigate to="/explore/pricing" replace />;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProcessing(true);

    // This checkout is intentionally non-transactional until Stripe is wired
    // in. The short processing state ends without changing the account, and no
    // payment details are sent to, or retained by, the Atlas server.
    window.setTimeout(() => {
      setProcessing(false);
    }, 900);
  };

  return (
    <div className="drafting-grid min-h-[100dvh] bg-paper">
      <header className="border-b border-edge bg-paper">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-5 py-4 sm:px-8">
          <Link
            to="/explore/pricing"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="text-[13px]" />
            Back to plans
          </Link>
          <Logo markClassName="h-5 w-5" wordClassName="text-[13px]" />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <section>
          <p className="edge">Secure checkout</p>
          <h1 className="display mt-3 text-[2.4rem] leading-none sm:text-[3.2rem]">
            Complete your order.
          </h1>
          <p className="mt-4 max-w-[58ch] text-[14px] leading-relaxed text-ink-3">
            Choose how you would like to pay. Your Atlas subscription begins after payment is
            confirmed.
          </p>

          <div className="mt-8 border border-edge bg-sheet">
            <div className="border-b border-rule px-5 py-4 sm:px-6">
              <p className="edge-sm text-ink-3">Payment method</p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Payment method">
                {PAYMENT_METHODS.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={method === candidate}
                    onClick={() => setMethod(candidate)}
                    className={`h-8 rounded-sm border px-3 text-[12px] font-medium transition-colors ${
                      method === candidate
                        ? 'border-ink bg-ink text-white'
                        : 'border-edge bg-paper text-ink-2 hover:border-edgeStrong'
                    }`}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={submit} className="space-y-5 px-5 py-6 sm:px-6" noValidate={false}>
              {method === 'Card' ? (
                <>
                  <Field label="Name on card" htmlFor="card-name" required>
                    <Input
                      id="card-name"
                      autoComplete="cc-name"
                      value={card.name}
                      onChange={(event) => setCard({ ...card, name: event.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Card number" htmlFor="card-number" required>
                    <Input
                      id="card-number"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="1234 5678 9012 3456"
                      value={card.number}
                      onChange={(event) =>
                        setCard({ ...card, number: formatCardNumber(event.target.value) })
                      }
                      minLength={19}
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Expiry" htmlFor="card-expiry" required>
                      <Input
                        id="card-expiry"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM / YY"
                        value={card.expiry}
                        onChange={(event) =>
                          setCard({ ...card, expiry: formatExpiry(event.target.value) })
                        }
                        minLength={7}
                        required
                      />
                    </Field>
                    <Field label="Security code" htmlFor="card-cvc" required>
                      <Input
                        id="card-cvc"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        placeholder="CVC"
                        value={card.cvc}
                        onChange={(event) =>
                          setCard({
                            ...card,
                            cvc: event.target.value.replace(/\D/g, '').slice(0, 4),
                          })
                        }
                        minLength={3}
                        required
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <div className="border border-rule bg-paper p-4 text-[13px] leading-relaxed text-ink-2">
                    Continue to connect your {method} account. You will return to Atlas to confirm
                    the order.
                  </div>
                  <Field label="Receipt email" htmlFor="payment-email" required>
                    <Input
                      id="payment-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={account.user.email}
                      required
                    />
                  </Field>
                </>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full justify-center"
                loading={processing}
              >
                {details.price === 'Custom'
                  ? 'Request Enterprise checkout'
                  : `Pay ${details.amount}`}
              </Button>
              <p className="flex items-start justify-center gap-1.5 text-center text-[11.5px] leading-relaxed text-ink-4">
                <ShieldCheck className="mt-0.5 shrink-0 text-[13px]" />
                Payment details stay in this mock checkout and are not sent to Atlas.
              </p>
            </form>
          </div>

          <div className="mt-5">
            <p className="edge-sm text-ink-4">Accepted methods</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              Visa, Mastercard, American Express, Discover, PayPal, Apple Pay, Google Pay, bank
              transfer, Cash App Pay, Klarna, and Link.
            </p>
          </div>
        </section>

        <aside className="lg:pt-[86px]">
          <div className="border border-edge bg-sheet">
            <div className="border-b border-rule px-5 py-3">
              <p className="edge-sm">Order summary</p>
            </div>
            <div className="px-5 py-5">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="title text-[18px]">{details.name}</p>
                  <p className="mt-1 text-[12px] text-ink-3">{details.capacity}</p>
                </div>
                <p className="font-mono text-[16px] font-medium text-ink">{details.price}</p>
              </div>
              <ul className="mt-6 space-y-3 border-t border-rule pt-5">
                {details.highlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2"
                  >
                    <Check className="mt-0.5 shrink-0 text-[12px] text-mark" />
                    {highlight}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center justify-between border-t border-edge pt-4">
                <span className="text-[13px] font-medium text-ink">Due today</span>
                <span className="font-mono text-[15px] font-semibold text-ink">
                  {details.amount}
                </span>
              </div>
              {details.price !== 'Custom' && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
                  Renews monthly. Cancel before the next billing date.
                </p>
              )}
            </div>
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-ink-4">
            By continuing, you agree to the Atlas{' '}
            <Link to="/legal/terms" className="underline underline-offset-2 hover:text-ink">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/legal/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>
            .
          </p>
        </aside>
      </main>
    </div>
  );
}
