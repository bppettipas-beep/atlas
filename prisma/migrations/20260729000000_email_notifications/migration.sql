-- Per-person master switch for emailing the in-app notifications.
-- Defaults to true so existing people start receiving them without a backfill.
ALTER TABLE "NotificationPreference"
  ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT true;
