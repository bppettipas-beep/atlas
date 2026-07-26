import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { withTimeOfDay } from '../lib/dates';
import { recordActivity } from './activity';
import { notify } from './notifications';

/**
 * Background behaviour for work: escalating tasks that go overdue, and turning
 * recurring templates into real tasks. Both are safe to run repeatedly — they
 * only act on rows that have not been handled yet.
 */

/** Owner + the assignee's manager, deduplicated. */
async function escalationRecipients(companyId: string, assigneeId: string | null) {
  const recipients = new Set<string>();

  const owners = await prisma.membership.findMany({
    where: { companyId, role: 'OWNER', deactivatedAt: null },
    select: { id: true },
  });
  owners.forEach((owner) => recipients.add(owner.id));

  if (assigneeId) {
    const assignee = await prisma.membership.findUnique({
      where: { id: assigneeId },
      select: { managerId: true },
    });
    if (assignee?.managerId) recipients.add(assignee.managerId);
    recipients.delete(assigneeId);
  }

  return Array.from(recipients);
}

export async function escalateTask(taskId: string, reason: 'OVERDUE' | 'BLOCKED') {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: { include: { user: { select: { fullName: true } } } } },
  });
  if (!task || task.archivedAt || task.status === 'DONE') return;

  const recipients = await escalationRecipients(task.companyId, task.assigneeId);
  const who = task.assignee?.user.fullName ?? 'Nobody';
  const title = reason === 'OVERDUE' ? `Overdue: ${task.title}` : `Blocked: ${task.title}`;
  const body =
    reason === 'OVERDUE'
      ? `${who} has not finished this and the due date has passed.`
      : task.blockedReason
        ? `${who} reported a blocker: ${task.blockedReason}`
        : `${who} reported this task as blocked.`;

  for (const recipientId of recipients) {
    await notify({
      companyId: task.companyId,
      recipientId,
      actorId: task.assigneeId,
      type: reason === 'OVERDUE' ? 'TASK_OVERDUE' : 'TASK_BLOCKED',
      title,
      body,
      entityType: 'task',
      entityId: task.id,
      taskId: task.id,
    });
  }

  await prisma.task.update({ where: { id: task.id }, data: { escalatedAt: new Date() } });

  await recordActivity({
    companyId: task.companyId,
    type: 'TASK_ESCALATED',
    summary: `"${task.title}" was escalated (${reason.toLowerCase()})`,
    taskId: task.id,
    targetId: task.assigneeId,
    visibility: 'MANAGERS',
    metadata: { reason },
  });

  emitToCompany(task.companyId, 'task:updated', { taskId: task.id });
}

/** Escalates every task that is overdue and has not been escalated yet. */
export async function runOverdueEscalation(): Promise<number> {
  const overdue = await prisma.task.findMany({
    where: {
      archivedAt: null,
      status: { notIn: ['DONE'] },
      dueAt: { lt: new Date() },
      escalatedAt: null,
    },
    select: { id: true },
    take: 100,
  });

  for (const task of overdue) {
    await escalateTask(task.id, 'OVERDUE');
  }
  return overdue.length;
}

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  weekdays: number[];
  dayOfMonth?: number | null;
  timeOfDay: string;
}

export function computeNextRun(template: RecurrenceRule, from: Date = new Date()): Date {
  const interval = Math.max(1, template.interval);

  if (template.frequency === 'DAILY') {
    const next = withTimeOfDay(from, template.timeOfDay);
    while (next.getTime() <= from.getTime()) {
      next.setDate(next.getDate() + interval);
    }
    return next;
  }

  if (template.frequency === 'WEEKLY') {
    const weekdays = template.weekdays.length > 0 ? [...template.weekdays].sort() : [from.getDay()];
    for (let offset = 1; offset <= 7 * interval + 7; offset += 1) {
      const candidate = withTimeOfDay(from, template.timeOfDay);
      candidate.setDate(candidate.getDate() + offset);
      if (weekdays.includes(candidate.getDay())) return candidate;
    }
  }

  // MONTHLY
  const next = withTimeOfDay(from, template.timeOfDay);
  next.setMonth(next.getMonth() + interval);
  if (template.dayOfMonth) {
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(template.dayOfMonth, daysInMonth));
  }
  return next;
}

/** Materialises tasks for every template whose next run has arrived. */
export async function runRecurringTemplates(): Promise<number> {
  const due = await prisma.taskTemplate.findMany({
    where: { active: true, nextRunAt: { lte: new Date() } },
    take: 50,
  });

  for (const template of due) {
    const dueAt = template.nextRunAt ?? new Date();
    const task = await prisma.task.create({
      data: {
        companyId: template.companyId,
        title: template.titleTemplate,
        description: template.description,
        priority: template.priority,
        dueAt,
        assigneeId: template.defaultAssigneeId,
        teamId: template.teamId,
        templateId: template.id,
        requiresApproval: template.requiresApproval,
        requiresProofPhoto: template.requiresProofPhoto,
      },
    });

    await prisma.taskTemplate.update({
      where: { id: template.id },
      data: {
        lastGeneratedAt: new Date(),
        nextRunAt: computeNextRun(template, dueAt),
      },
    });

    await recordActivity({
      companyId: template.companyId,
      type: 'TASK_CREATED',
      summary: `Recurring task "${task.title}" was created from the "${template.name}" template`,
      taskId: task.id,
      targetId: template.defaultAssigneeId,
      metadata: { recurring: true },
    });

    if (template.defaultAssigneeId) {
      await notify({
        companyId: template.companyId,
        recipientId: template.defaultAssigneeId,
        type: 'TASK_ASSIGNED',
        title: `New recurring task: ${task.title}`,
        body: 'This task was created automatically from a recurring template.',
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    emitToCompany(template.companyId, 'task:created', { taskId: task.id });
  }

  return due.length;
}
