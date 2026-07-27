-- Placeholder people.
--
-- Somebody added by hand who has never signed in: a stand-in for a role you
-- are still hiring for, or a member of staff who does not use a computer.
--
-- They are a normal Membership in every other respect, which is the point —
-- they appear on the map, hold a role, join teams and get assigned work
-- without a single branch anywhere else in the codebase. Their User row
-- carries no password and no Google id, so it cannot be signed into.

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "isPlaceholder" BOOLEAN NOT NULL DEFAULT false;
