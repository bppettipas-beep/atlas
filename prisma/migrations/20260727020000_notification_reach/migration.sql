-- AlterEnum
-- Adding several values at once needs PostgreSQL 12 or later, which both the
-- embedded development database and Railway are well past. The values are only
-- declared here, never used in this migration, so the transaction is fine.
ALTER TYPE "NotificationType" ADD VALUE 'TASK_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMMENTED';
ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_LEFT';
ALTER TYPE "NotificationType" ADD VALUE 'ROLE_ASSIGNED';

-- AlterTable
ALTER TABLE "NotificationPreference"
  ADD COLUMN "taskComments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "companyActivity" BOOLEAN NOT NULL DEFAULT true;
