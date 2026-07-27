/**
 * Atlas's design system — drawn, not decorated.
 *
 * Everything the product is built from lives here so the visual language stays
 * one language. Before adding a primitive, check whether an existing one plus a
 * class does the job; the smallest system that covers the product is the goal.
 *
 * House rules, enforced by convention rather than by types:
 *   • Radii never exceed 3px. Nothing in this product is a pill.
 *   • Separation is a hairline rule or a value step. Shadows are for things
 *     that genuinely float (modals, drawers, menus).
 *   • Labels use `.edge`; figures use `font-mono`; only sentences use body.
 *   • One primary action per view. `mark` is a mark, not a mood.
 */
import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CaretDown, Check, Info, Spinner as SpinnerGlyph, Warning, X } from '@/components/icons';
import { avatarTint, cn, initials } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Motion                                                                     */
/* -------------------------------------------------------------------------- */

/** The one curve. Exponential ease-out, already-visible default. */
export const DRAFT_EASE = [0.16, 1, 0.3, 1] as const;

/* -------------------------------------------------------------------------- */
/*  Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'mark';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-2 active:bg-black disabled:bg-ink-4',
  default:
    'border border-edge bg-sheet text-ink hover:border-edgeStrong hover:bg-paper active:bg-paper-deep disabled:text-ink-4 disabled:hover:border-edge disabled:hover:bg-sheet',
  ghost:
    'text-ink-2 hover:bg-paper-deep hover:text-ink disabled:text-ink-4 disabled:hover:bg-transparent',
  danger: 'bg-alert text-white hover:bg-[#911d17] disabled:bg-alert/40',
  mark: 'bg-mark text-white hover:bg-mark-deep disabled:bg-mark/40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-1.5',
  lg: 'h-10 px-4 text-[14px] gap-2',
  icon: 'h-8 w-8 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', loading, icon, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center rounded-sm font-medium',
        'transition-colors duration-150 ease-draft disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <SpinnerGlyph className="shrink-0 animate-spin text-[1.05em]" />
      ) : (
        icon && <span className="shrink-0 text-[1.15em] leading-none">{icon}</span>
      )}
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/*  Fields                                                                     */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="edge block">
          {label}
          {required && <span className="ml-1 text-mark">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-snug text-alert">
          <Warning className="mt-[3px] shrink-0 text-[11px]" />
          <span>{error}</span>
        </p>
      ) : (
        hint && <p className="text-[12px] leading-snug text-ink-3">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('field', className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('field min-h-[84px] resize-y leading-relaxed', className)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn('field appearance-none pr-8', className)} {...props}>
          {children}
        </select>
        <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-3" />
      </div>
    );
  },
);

export function Checkbox({
  label,
  description,
  className,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  description?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-pointer rounded-none border-edgeStrong text-ink focus:ring-0 focus:ring-offset-0"
        {...props}
      />
      <label
        htmlFor={inputId}
        className="cursor-pointer select-none text-[13px] leading-snug text-ink-2"
      >
        {label}
        {description && <span className="mt-0.5 block text-[12px] text-ink-3">{description}</span>}
      </label>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-rule py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {description && <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-sm border transition-colors duration-150 ease-draft disabled:opacity-40',
          checked ? 'border-ink bg-ink' : 'border-edgeStrong bg-sheet',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-[1px]',
            checked ? 'left-[19px] bg-sheet' : 'left-[2px] bg-edgeStrong',
          )}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

/** A sheet on the paper ground. `ticked` adds the corner registration marks. */
export function Sheet({
  className,
  ticked,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ticked?: boolean }) {
  return (
    <div className={cn('sheet rounded-sm', ticked && 'ticked', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * A ruled section head. The label sits on the rule, the way a title block sits
 * on a drawing border — which is why this is the only "eyebrow" in the system.
 */
export function RuledHead({
  index,
  title,
  description,
  meta,
  action,
  className,
}: {
  /** Optional two-digit drawing index. Only pass one where order carries meaning. */
  index?: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {index && <span className="font-mono text-[11px] leading-none text-ink-4">{index}</span>}
        <h2 className="edge shrink-0 text-ink-2">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-rule" />
        {meta && <span className="shrink-0 font-mono text-[11px] text-ink-4">{meta}</span>}
        {action}
      </div>
      {description && (
        <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-ink-3">{description}</p>
      )}
    </div>
  );
}

/** Inline status chip. Neutral by default — pass a tone class to name a state. */
export function Chip({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        'edge-sm inline-flex items-center gap-1.5 border border-rule bg-sheet px-1.5 py-[3px] text-ink-2',
        className,
      )}
    >
      {dot && <span className={cn('h-[5px] w-[5px] shrink-0', dot)} />}
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-[11px]',
    lg: 'h-10 w-10 text-[12px]',
    xl: 'h-14 w-14 text-[16px]',
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 rounded-sm object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        // Square with a 2px radius — a stamped initial, not a bubble.
        'inline-flex shrink-0 select-none items-center justify-center rounded-sm font-semibold',
        avatarTint(name),
        sizes[size],
        className,
      )}
      style={{ fontStretch: '80%' }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * A measured bar. The fill *draws* from zero — the one authored motion in the
 * product, shared with the nav tick and the map's selected edges.
 */
export function Meter({
  value,
  className,
  tone = 'ink',
}: {
  value: number;
  className?: string;
  tone?: 'ink' | 'mark' | 'alert' | 'done';
}) {
  const tones = { ink: 'bg-ink', mark: 'bg-mark', alert: 'bg-alert', done: 'bg-done' };
  return (
    <div className={cn('h-[3px] w-full overflow-hidden bg-paper-deep', className)}>
      <motion.div
        className={cn('h-full origin-left', tones[tone])}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(0, Math.min(100, value)) / 100 }}
        transition={{ duration: 0.5, ease: DRAFT_EASE }}
        style={{ width: '100%' }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <SpinnerGlyph className={cn('animate-spin text-[14px] text-ink-3', className)} />;
}

export function LoadingState({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-20 text-center', className)}
    >
      <Spinner className="text-[16px]" />
      <p className="edge">{label}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('border border-rule bg-sheet', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-rule px-4 py-3.5 last:border-0"
        >
          <div className="skeleton h-6 w-6 shrink-0" />
          <div
            className="skeleton h-3 flex-1"
            style={{ maxWidth: `${58 + ((index * 13) % 34)}%` }}
          />
          <div className="skeleton h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty states are drawn as an unassigned region on a plan: a hatched panel
 * with the reason edge-printed on it. No illustration, no icon-in-a-circle.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: DRAFT_EASE }}
      className={cn(
        'ticked relative flex flex-col items-center justify-center border border-dashed border-edge bg-sheet px-6 py-14 text-center',
        className,
      )}
    >
      <span aria-hidden className="hatched pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative flex flex-col items-center">
        {icon && (
          <span className="mb-4 flex h-9 w-9 items-center justify-center border border-rule bg-sheet text-[17px] text-ink-3">
            {icon}
          </span>
        )}
        <h3 className="title text-[14px]">{title}</h3>
        {description && (
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-3">{description}</p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </motion.div>
  );
}

export function ErrorState({
  title = 'That did not load',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center border border-alert/30 bg-alert-wash px-6 py-12 text-center',
        className,
      )}
    >
      <Warning className="mb-3 text-[20px] text-alert" />
      <h3 className="title text-[14px] text-alert">{title}</h3>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">{message}</p>
      {onRetry && (
        <Button className="mt-5" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = 'alert',
  children,
  className,
}: {
  tone?: 'alert' | 'pending' | 'info';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    alert: 'border-alert/30 bg-alert-wash text-alert',
    pending: 'border-pending/30 bg-pending-wash text-pending',
    info: 'border-rule bg-paper text-ink-2',
  };
  const Glyph = tone === 'info' ? Info : Warning;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 border px-3 py-2.5 text-[13px] leading-snug',
        tones[tone],
        className,
      )}
    >
      <Glyph className="mt-[2px] shrink-0 text-[13px]" />
      <span>{children}</span>
    </div>
  );
}

/** Kept as an alias so form code reads naturally. */
export const InlineError = ({ message, className }: { message: string; className?: string }) => (
  <Notice tone="alert" className={className}>
    {message}
  </Notice>
);

/* -------------------------------------------------------------------------- */
/*  Overlays                                                                   */
/* -------------------------------------------------------------------------- */

function useDismiss(open: boolean, onClose: () => void, lockScroll = false) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    let previous = '';
    if (lockScroll) {
      previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      if (lockScroll) document.body.style.overflow = previous;
    };
  }, [open, onClose, lockScroll]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useDismiss(open, onClose, true);
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-ink/20"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: DRAFT_EASE }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden border border-edge bg-sheet shadow-panel',
              widths[size],
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
              <div className="min-w-0">
                <h2 className="title text-[15px]">{title}</h2>
                {description && (
                  <p className="mt-1 text-[13px] leading-snug text-ink-3">{description}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="text-[14px]" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

            {footer && (
              <footer className="flex items-center justify-end gap-2 border-t border-rule bg-paper px-5 py-3">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({
  open,
  onClose,
  children,
  labelledBy,
  width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  width?: string;
}) {
  useDismiss(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-ink/15"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: DRAFT_EASE }}
            className={cn(
              'absolute inset-y-0 right-0 flex w-full flex-col border-l border-edge bg-sheet shadow-panel',
              width,
            )}
          >
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Menu({
  trigger,
  children,
  align = 'left',
  side = 'bottom',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: 'left' | 'right';
  /**
   * Which way the menu opens. A trigger sitting at the bottom of the screen —
   * the account block in the sidebar — must open upwards, or the menu lands
   * below the viewport and looks like nothing happened.
   */
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: side === 'top' ? 3 : -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === 'top' ? 3 : -3 }}
            transition={{ duration: 0.14, ease: DRAFT_EASE }}
            className={cn(
              'absolute z-40 min-w-[200px] border border-edge bg-sheet py-1 shadow-lift',
              side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {children({ close: () => setOpen(false) })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  children,
  icon,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:text-ink-4',
        danger ? 'text-alert hover:bg-alert-wash' : 'text-ink-2 hover:bg-paper-deep hover:text-ink',
      )}
    >
      {icon && <span className="shrink-0 text-[14px] text-ink-4">{icon}</span>}
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="edge-sm px-3 pb-1 pt-2">{children}</p>;
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-rule" />;
}

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex items-center gap-5 overflow-x-auto border-b border-rule', className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'edge relative shrink-0 py-2.5 transition-colors duration-150',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            <span className="inline-flex items-baseline gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn('font-mono text-[10px]', active ? 'text-ink-2' : 'text-ink-4')}>
                  {String(tab.count).padStart(2, '0')}
                </span>
              )}
            </span>
            {active && (
              <motion.span
                layoutId="atlas-tab-rule"
                className="absolute inset-x-0 -bottom-px h-[2px] bg-ink"
                transition={{ duration: 0.28, ease: DRAFT_EASE }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toasts                                                                     */
/* -------------------------------------------------------------------------- */

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

const ToastContext = createContext<{
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: Toast['tone']) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4400);
  }, []);

  const value = useMemo(
    () => ({
      success: (message: string) => push(message, 'success'),
      error: (message: string) => push(message, 'error'),
      info: (message: string) => push(message, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.24, ease: DRAFT_EASE }}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 border bg-sheet px-3 py-2.5 text-[13px] leading-snug shadow-lift',
                toast.tone === 'error' ? 'border-alert/40 text-alert' : 'border-edge text-ink',
              )}
            >
              {toast.tone === 'success' && (
                <Check className="mt-[3px] shrink-0 text-[12px] text-done" />
              )}
              {toast.tone === 'error' && <Warning className="mt-[3px] shrink-0 text-[12px]" />}
              {toast.tone === 'info' && (
                <Info className="mt-[3px] shrink-0 text-[12px] text-ink-3" />
              )}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}

/* -------------------------------------------------------------------------- */
/*  Page scaffold                                                              */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="edge-sm mb-2">{eyebrow}</p>}
        <h1 className="display text-[26px] leading-[1.1] sm:text-[32px]">{title}</h1>
        {description && (
          <p className="mt-2.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-3">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A figure: the number is the content, the label is edge-printed above it, and
 * the whole thing sits on a rule rather than inside a floating card.
 */
export function Figure({
  label,
  value,
  tone = 'ink',
  hint,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: 'ink' | 'mark' | 'pending' | 'alert' | 'done';
  hint?: string;
  onClick?: () => void;
}) {
  const tones = {
    ink: 'text-ink',
    mark: 'text-mark',
    pending: 'text-pending',
    alert: 'text-alert',
    done: 'text-done',
  };
  const body = (
    <>
      <p className="edge-sm">{label}</p>
      <p
        className={cn(
          'mt-1.5 font-mono text-[26px] font-light leading-none tracking-tight',
          tones[tone],
        )}
      >
        {typeof value === 'number' ? String(value).padStart(2, '0') : value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-ink-4">{hint}</p>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group border-t-2 border-ink px-0.5 pb-1 pt-3 text-left transition-colors duration-150 hover:border-mark"
      >
        {body}
      </button>
    );
  }
  return <div className="border-t-2 border-ink px-0.5 pb-1 pt-3">{body}</div>;
}
