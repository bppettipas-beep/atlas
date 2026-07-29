import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AvailabilityStatus, CompanyRole, TaskPriority, TaskStatus } from '@shared/types';

/** Tailwind-aware className joiner used by every component. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic avatar tint so a person keeps the same stamp everywhere.
 * Only ink values — the palette owns no hue beyond the annotation blue, and a
 * rainbow of avatar colours is exactly the noise this product avoids.
 */
export function avatarTint(seed: string): string {
  const tints = [
    'bg-ink text-white',
    'bg-ink-2 text-white',
    'bg-ink-3 text-white',
    'bg-paper-deep text-ink border border-edge',
    'bg-mark text-white',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return tints[hash % tints.length];
}

// ------------------------------- formatting --------------------------------

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "in 3 days", "2 hours ago" — short and human. */
export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  const timestamp = date.getTime();
  // A live payload can arrive before an optional timestamp has been fully
  // serialised. Intl.RelativeTimeFormat throws for NaN, which used to turn one
  // malformed chat timestamp into a crashed page.
  if (!Number.isFinite(timestamp)) return '';
  const diffMs = timestamp - Date.now();
  const abs = Math.abs(diffMs);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function dueLabel(dueAt: string | null, status: TaskStatus): string {
  if (!dueAt) return 'No due date';
  const date = new Date(dueAt);
  const isOverdue = status !== 'DONE' && date.getTime() < Date.now();
  if (isOverdue) return `Overdue · ${relativeTime(dueAt)}`;

  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return `Today · ${formatTime(dueAt)}`;
  return formatDateTime(dueAt);
}

/** Turns a "date-time-local" input value into an ISO string (or null). */
export function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Turns an ISO string into the value a `datetime-local` input expects. */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ------------------------------ display meta -------------------------------

/**
 * Status is carried by a small square mark plus edge-register text — never by
 * a tinted card. Only three states earn a colour, because only three states
 * mean "act now": blocked/overdue, waiting on someone, finished.
 */
export const STATUS_META: Record<
  TaskStatus,
  { label: string; short: string; dot: string; chip: string; order: number }
> = {
  NOT_STARTED: {
    label: 'Not started',
    short: 'Queued',
    dot: 'bg-edgeStrong',
    chip: 'text-ink-3',
    order: 0,
  },
  IN_PROGRESS: {
    label: 'In progress',
    short: 'Running',
    dot: 'bg-ink',
    chip: 'border-ink/20 text-ink',
    order: 1,
  },
  BLOCKED: {
    label: 'Blocked',
    short: 'Blocked',
    dot: 'bg-alert',
    chip: 'border-alert/35 text-alert',
    order: 2,
  },
  AWAITING_REVIEW: {
    label: 'Awaiting review',
    short: 'Review',
    dot: 'bg-pending',
    chip: 'border-pending/35 text-pending',
    order: 3,
  },
  DONE: {
    label: 'Done',
    short: 'Done',
    dot: 'bg-done',
    chip: 'border-done/35 text-done',
    order: 4,
  },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; chip: string; rank: string }> = {
  LOW: { label: 'Low', chip: 'text-ink-4', rank: 'P4' },
  MEDIUM: { label: 'Medium', chip: 'text-ink-3', rank: 'P3' },
  HIGH: { label: 'High', chip: 'border-pending/35 text-pending', rank: 'P2' },
  URGENT: { label: 'Urgent', chip: 'border-alert/35 text-alert', rank: 'P1' },
};

export const AVAILABILITY_META: Record<
  AvailabilityStatus,
  { label: string; dot: string; text: string }
> = {
  AVAILABLE: { label: 'Available', dot: 'bg-done', text: 'text-done' },
  BUSY: { label: 'Busy', dot: 'bg-pending', text: 'text-pending' },
  FOCUSED: { label: 'Focused', dot: 'bg-mark', text: 'text-mark' },
  OFF_SHIFT: { label: 'Off shift', dot: 'bg-edgeStrong', text: 'text-ink-3' },
  ON_LEAVE: { label: 'On leave', dot: 'bg-ink-4', text: 'text-ink-3' },
};

export const ROLE_META: Record<CompanyRole, { label: string; chip: string }> = {
  OWNER: { label: 'Owner', chip: 'border-mark bg-mark text-white' },
  CO_OWNER: { label: 'Co-owner', chip: 'border-pending bg-pending-wash text-pending' },
  MANAGER: { label: 'Manager', chip: 'border-alert bg-alert-wash text-alert' },
  WORKER: { label: 'Worker', chip: 'text-ink-3' },
};

/**
 * Edge inks for the organization map. A reporting line is solid black because
 * it is the structural fact; everything softer or inferred is drawn lighter or
 * dashed, the way a draughtsman distinguishes construction lines from real ones.
 */
export const RELATIONSHIP_META: Record<string, { label: string; stroke: string; dashed: boolean }> =
  {
    REPORTS_TO: { label: 'Reports to', stroke: '#121211', dashed: false },
    TEAM_MEMBER: { label: 'Team', stroke: '#b4b0a8', dashed: false },
    COLLABORATES_WITH: { label: 'Works with', stroke: '#1b4dff', dashed: true },
    SHARES_SKILL: { label: 'Shared skill', stroke: '#cecbc5', dashed: true },
    OWNS_AREA: { label: 'Owns area', stroke: '#2f6b4f', dashed: false },
    MENTORS: { label: 'Mentors', stroke: '#8a6a00', dashed: true },
  };

/** Two-digit drawing index, e.g. node "07". Used on the map and in title blocks. */
export function drawingIndex(value: number): string {
  return String(value).padStart(2, '0');
}

/** A short, stable reference code for a record — printed like a part number. */
export function refCode(prefix: string, id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return `${prefix}-${String(hash % 10000).padStart(4, '0')}`;
}

export const ACTIVITY_LABELS: Record<string, string> = {
  MEMBER_JOINED: 'Person joined',
  MEMBER_ROLE_CHANGED: 'Role changed',
  MEMBER_DEACTIVATED: 'Person deactivated',
  MANAGER_CHANGED: 'Reporting line changed',
  TEAM_CREATED: 'Team created',
  TEAM_UPDATED: 'Team updated',
  TEAM_MEMBER_ADDED: 'Added to team',
  TEAM_MEMBER_REMOVED: 'Removed from team',
  TASK_CREATED: 'Task created',
  TASK_ASSIGNED: 'Task assigned',
  TASK_STATUS_CHANGED: 'Task status changed',
  TASK_COMPLETED: 'Task completed',
  TASK_BLOCKED: 'Task blocked',
  TASK_APPROVED: 'Task approved',
  TASK_COMMENTED: 'Comment posted',
  TASK_ESCALATED: 'Task escalated',
  DOCUMENT_CREATED: 'Document created',
  DOCUMENT_UPDATED: 'Document updated',
  DOCUMENT_ACKNOWLEDGED: 'Document acknowledged',
  INVITE_CREATED: 'Invitation created',
  INVITE_USED: 'Invitation used',
  ANNOUNCEMENT_POSTED: 'Announcement posted',
  RELATIONSHIP_CHANGED: 'Connection changed',
  SUBSCRIPTION_UPGRADED: 'Plan upgraded',
};
