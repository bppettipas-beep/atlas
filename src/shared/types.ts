/**
 * Types shared by the Express API and the React client.
 *
 * These deliberately mirror the Prisma models but only expose the fields the
 * API actually serialises, so the client never depends on `@prisma/client`.
 */

export const COMPANY_ROLES = ['OWNER', 'CO_OWNER', 'MANAGER', 'WORKER'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const AVAILABILITY_STATUSES = [
  'AVAILABLE',
  'BUSY',
  'FOCUSED',
  'OFF_SHIFT',
  'ON_LEAVE',
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const TASK_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'AWAITING_REVIEW',
  'DONE',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const RELATIONSHIP_TYPES = [
  'REPORTS_TO',
  'TEAM_MEMBER',
  'COLLABORATES_WITH',
  'SHARES_SKILL',
  'OWNS_AREA',
  'MENTORS',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const DOCUMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_MENTIONED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_DUE_CHANGED'
  | 'TASK_OVERDUE'
  | 'TASK_BLOCKED'
  | 'TASK_APPROVED'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'TASK_COMMENTED'
  | 'TEAM_ADDED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'ROLE_ASSIGNED'
  | 'DOCUMENT_PUBLISHED'
  | 'DOCUMENT_ACK_REQUESTED'
  | 'ANNOUNCEMENT';

export const ACTIVITY_TYPES = [
  'MEMBER_JOINED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_DEACTIVATED',
  'MANAGER_CHANGED',
  'TEAM_CREATED',
  'TEAM_UPDATED',
  'TEAM_MEMBER_ADDED',
  'TEAM_MEMBER_REMOVED',
  'TASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_STATUS_CHANGED',
  'TASK_COMPLETED',
  'TASK_BLOCKED',
  'TASK_APPROVED',
  'TASK_COMMENTED',
  'TASK_ESCALATED',
  'DOCUMENT_CREATED',
  'DOCUMENT_UPDATED',
  'DOCUMENT_ACKNOWLEDGED',
  'INVITE_CREATED',
  'INVITE_USED',
  'ANNOUNCEMENT_POSTED',
  'RELATIONSHIP_CHANGED',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type AttachmentKind = 'GENERAL' | 'COMPLETION_PROOF';

// --------------------------------- DTOs ------------------------------------

export interface CompanyDto {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  sizeRange: string | null;
  location: string | null;
  timezone: string;
  logoUrl: string | null;
  createdAt: string;
}

/**
 * A company's own named role. Position, not permission — see `CompanyRole`
 * for the three tiers that actually decide what somebody may do.
 */
export interface RoleDto {
  id: string;
  name: string;
  color: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  /** Given to anybody joining with an invitation code. At most one per company. */
  isDefault: boolean;
  memberCount: number;
}

/** The role as it appears on a person, without the tree bookkeeping. */
export interface RoleBadge {
  id: string;
  name: string;
  color: string;
}

export interface PersonSummary {
  id: string; // membership id
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: CompanyRole;
  status: MembershipStatus;
  jobTitle: string | null;
  managerId: string | null;
  availability: AvailabilityStatus;
  headline: string | null;
  /** Added by hand and has never signed in. Editable and assignable like anyone else. */
  isPlaceholder: boolean;
  assignedRole: RoleBadge | null;
  teams: { id: string; name: string; color: string | null }[];
}

export interface PersonDetail extends PersonSummary {
  bio: string | null;
  phone: string | null;
  workEmail: string | null;
  location: string | null;
  timezone: string | null;
  startDate: string | null;
  availabilityNote: string | null;
  weeklyHoursTarget: number | null;
  joinedAt: string;
  manager: { id: string; fullName: string; jobTitle: string | null } | null;
  directReports: { id: string; fullName: string; jobTitle: string | null }[];
  skills: { id: string; name: string; level: number }[];
  certifications: {
    id: string;
    name: string;
    issuer: string | null;
    issuedAt: string | null;
    expiresAt: string | null;
  }[];
  trainingRecords: {
    id: string;
    title: string;
    documentId: string | null;
    completedAt: string | null;
  }[];
  ownedDocuments: { id: string; title: string; category: string }[];
  workload: {
    active: number;
    overdue: number;
    blocked: number;
    completedLast30Days: number;
  };
  activeTasks: TaskSummary[];
  recentlyCompleted: TaskSummary[];
  /** Only present for owners/managers. */
  notes?: {
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; fullName: string } | null;
  }[];
  timeline: ActivityEventDto[];
}

export interface TeamDto {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  leadId: string | null;
  memberCount: number;
  members?: { id: string; fullName: string; jobTitle: string | null; avatarUrl: string | null }[];
}

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completionPercent: number;
  isOverdue: boolean;
  assignee: { id: string; fullName: string; avatarUrl: string | null } | null;
  team: { id: string; name: string; color: string | null } | null;
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  scheduledBy: { id: string; fullName: string } | null;
  requiresApproval: boolean;
  requiresProofPhoto: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  completionNote: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  escalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string } | null;
  approvedBy: { id: string; fullName: string } | null;
  document: { id: string; title: string; category: string } | null;
  subtasks: { id: string; title: string; done: boolean; position: number }[];
  comments: TaskCommentDto[];
  attachments: TaskAttachmentDto[];
  history: ActivityEventDto[];
}

export interface TaskCommentDto {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string; avatarUrl: string | null } | null;
  mentions: { id: string; fullName: string }[];
  attachments: TaskAttachmentDto[];
}

export interface TaskAttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  kind: AttachmentKind;
  createdAt: string;
  uploadedBy: { id: string; fullName: string } | null;
}

export interface OrgNodeDto {
  id: string;
  kind: 'PERSON' | 'TEAM';
  x: number;
  y: number;
  pinned: boolean;
  person?: PersonSummary;
  team?: TeamDto;
}

export interface OrgEdgeDto {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  label: string | null;
  strength: number;
  /** True for edges Atlas derives automatically (reporting lines, teams…). */
  derived: boolean;
}

export interface OrgGraphDto {
  nodes: OrgNodeDto[];
  edges: OrgEdgeDto[];
  summary: {
    people: number;
    teams: number;
    activeTasks: number;
    overdueTasks: number;
    unassignedTasks: number;
  };
}

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  tags: string[];
  status: DocumentStatus;
  requiresAcknowledgment: boolean;
  version: number;
  updatedAt: string;
  owner: { id: string; fullName: string; avatarUrl: string | null } | null;
  team: { id: string; name: string } | null;
  acknowledgedByMe: boolean;
  acknowledgmentCount: number;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocumentSummary {
  contentMarkdown: string;
  createdAt: string;
  people: { id: string; fullName: string; role: string; avatarUrl: string | null }[];
  relatedTasks: TaskSummary[];
  revisions: {
    id: string;
    version: number;
    title: string;
    changeNote: string | null;
    createdAt: string;
    editedBy: { id: string; fullName: string } | null;
  }[];
  acknowledgments: {
    id: string;
    membershipId: string;
    fullName: string;
    acknowledgedAt: string;
  }[];
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ActivityEventDto {
  id: string;
  type: ActivityType;
  summary: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  actor: { id: string; fullName: string; avatarUrl: string | null } | null;
  target: { id: string; fullName: string } | null;
  taskId: string | null;
  documentId: string | null;
  teamId: string | null;
}

export interface InviteCodeDto {
  id: string;
  code: string;
  label: string | null;
  role: CompanyRole;
  teamId: string | null;
  teamName: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  active: boolean;
  isUsable: boolean;
  createdAt: string;
  joinUrl: string;
}

export interface DirectInviteDto {
  id: string;
  email: string;
  role: CompanyRole;
  jobTitle: string | null;
  teamId: string | null;
  teamName: string | null;
  code: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  author: { id: string; fullName: string; avatarUrl: string | null } | null;
}

export type ConversationKind = 'COMPANY' | 'DIRECT' | 'GROUP';

export interface ChatMemberDto {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface ChatMessageDto {
  id: string;
  body: string;
  createdAt: string;
  sender: ChatMemberDto;
}

export interface ConversationDto {
  id: string;
  kind: ConversationKind;
  title: string | null;
  updatedAt: string;
  members: ChatMemberDto[];
  lastMessage: Omit<ChatMessageDto, 'id'> | null;
}

export interface SessionUserDto {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    /** False for accounts that only sign in with Google and have no password yet. */
    hasPassword: boolean;
    /** True once a Google account is linked, whether or not a password exists. */
    hasGoogle: boolean;
  };
  membership: {
    id: string;
    role: CompanyRole;
    jobTitle: string | null;
    status: MembershipStatus;
    availability: AvailabilityStatus;
  };
  company: CompanyDto;
  /** All companies this login belongs to, for the account switcher. */
  memberships: { id: string; companyId: string; companyName: string; role: CompanyRole }[];
  unreadNotifications: number;
}

export interface HomeSummaryDto {
  people: number;
  teams: number;
  tasksByStatus: Record<TaskStatus, number>;
  overdue: number;
  unassigned: number;
  dueToday: number;
  completedThisWeek: number;
  pendingAcknowledgments: number;
  openInvites: number;
}

export interface MyDayDto {
  greetingName: string;
  today: string;
  tasks: {
    overdue: TaskSummary[];
    dueToday: TaskSummary[];
    upcoming: TaskSummary[];
    blocked: TaskSummary[];
    awaitingReview: TaskSummary[];
    completedToday: TaskSummary[];
  };
  counts: { active: number; overdue: number; blocked: number; doneToday: number };
  manager: {
    id: string;
    fullName: string;
    jobTitle: string | null;
    avatarUrl: string | null;
  } | null;
  teams: TeamDto[];
  teammates: PersonSummary[];
  announcements: AnnouncementDto[];
  training: {
    id: string;
    title: string;
    category: string;
    requiresAcknowledgment: boolean;
    acknowledgedByMe: boolean;
  }[];
}

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

// ------------------------------ realtime -----------------------------------

export type RealtimeEvent =
  | { type: 'organization:updated' }
  | { type: 'task:created'; taskId: string }
  | { type: 'task:updated'; taskId: string }
  | { type: 'task:deleted'; taskId: string }
  | { type: 'task:comment'; taskId: string }
  | { type: 'people:updated' }
  | { type: 'knowledge:updated'; documentId?: string }
  | { type: 'activity:new' }
  | { type: 'announcement:new' }
  | { type: 'notification:new'; notification: NotificationDto }
  | { type: 'notification:read' };

/* -------------------------------- schedule -------------------------------- */

/** A column on the Schedule: one person, or one team. */
export interface ScheduleResource {
  id: string;
  kind: 'PERSON' | 'TEAM';
  name: string;
  /** Job title for a person, member count summary for a team. */
  subtitle: string | null;
  avatarUrl: string | null;
  color: string | null;
}

/**
 * One booked piece of work.
 *
 * This is a projection of a Task, not a record of its own — everything here
 * comes from the task, and editing it edits the task. `resourceIds` is the set
 * of columns the block belongs in, which is why it is plural: a task with both
 * an assignee and a team shows in both without being duplicated in the data.
 */
export interface ScheduleBlock {
  taskId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  startAt: string;
  endAt: string;
  location: string | null;
  isOverdue: boolean;
  completionPercent: number;
  assignee: { id: string; fullName: string; avatarUrl: string | null } | null;
  team: { id: string; name: string; color: string | null } | null;
  resourceIds: string[];
  /** Task ids this one overlaps for the same person. Empty when it is clear. */
  conflictsWith: string[];
  /** True when the block falls outside the assignee's working hours or time off. */
  outsideAvailability: boolean;
}

/** A person's normal week. Minutes are from midnight; 540 is 09:00. */
export interface WorkingHoursDto {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface TimeOffDto {
  id: string;
  membershipId: string;
  startAt: string;
  endAt: string;
  note: string | null;
  createdBy: { id: string; fullName: string } | null;
}

/** Availability for one person over the requested window. */
export interface ScheduleAvailability {
  membershipId: string;
  workingHours: WorkingHoursDto[];
  timeOff: TimeOffDto[];
}

/**
 * How full somebody's window is.
 *
 * Deliberately not a score. These are counts a manager can act on — "six hours
 * booked against four hours available" is a staffing decision; a productivity
 * rating is not.
 */
export interface ScheduleWorkload {
  membershipId: string;
  scheduledMinutes: number;
  availableMinutes: number;
  blockCount: number;
  conflictCount: number;
  outsideAvailabilityCount: number;
}

export interface ScheduleResponse {
  from: string;
  to: string;
  resources: ScheduleResource[];
  blocks: ScheduleBlock[];
  availability: ScheduleAvailability[];
  workload: ScheduleWorkload[];
  /** Scheduled work the caller may not open, counted so the view can say so. */
  hiddenCount: number;
}

/** What the caller is allowed to do, decided by the server and mirrored in the UI. */
export interface SchedulePermissions {
  canScheduleOthers: boolean;
  canManageAvailability: boolean;
  /** Membership ids whose schedule the caller may see. Empty means everyone. */
  visibleMembershipIds: string[];
}
