-- Rank and permission foundation. Existing memberships receive a system rank
-- in the same transaction; no membership is left without an authority record.
CREATE TYPE "PermissionScope" AS ENUM (
  'OWN', 'ASSIGNED', 'TEAM', 'MANAGED_PEOPLE', 'SELECTED_TEAMS', 'COMPANY_WIDE', 'EXPLICITLY_SHARED'
);

ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'INVITED';
ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'DEACTIVATED';
ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'REMOVED';

CREATE TABLE "Rank" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isProtected" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rank_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RankPermission" (
  "id" TEXT NOT NULL,
  "rankId" TEXT NOT NULL,
  "permissionKey" TEXT NOT NULL,
  "scope" "PermissionScope" NOT NULL,
  "selectedTeamIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RankPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermissionAuditLog" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "actorId" TEXT,
  "affectedMembershipId" TEXT,
  "affectedRankId" TEXT,
  "action" TEXT NOT NULL,
  "previousValue" JSONB,
  "nextValue" JSONB,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissionAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Membership" ADD COLUMN "rankId" TEXT;

-- Stable per-company system keys. Position 1 is the only rank protected from
-- reordering by every actor, including co-owners and administrators.
INSERT INTO "Rank" ("id", "companyId", "key", "name", "position", "isSystem", "isProtected", "updatedAt")
SELECT CONCAT('system_', c."id", '_', preset.key), c."id", preset.key, preset.name, preset.position, true, preset.protected, CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('owner', 'Owner', 1, true),
  ('co_owner', 'Co-owner', 2, true),
  ('administrator', 'Administrator', 3, true),
  ('manager', 'Manager', 4, false),
  ('supervisor', 'Supervisor', 5, false),
  ('team_lead', 'Team Lead', 6, false),
  ('worker', 'Worker', 7, false),
  ('contractor', 'Contractor', 8, false),
  ('guest', 'Guest', 9, false)
) AS preset(key, name, position, protected);

UPDATE "Membership" m
SET "rankId" = r."id"
FROM "Rank" r
WHERE r."companyId" = m."companyId"
  AND r."key" = CASE m."role"
    WHEN 'OWNER' THEN 'owner'
    WHEN 'CO_OWNER' THEN 'co_owner'
    WHEN 'MANAGER' THEN 'manager'
    ELSE 'worker'
  END;

-- Default grants. These are policy defaults, not hard-coded authorization:
-- the application reads RankPermission for every gated operation.
INSERT INTO "RankPermission" ("id", "rankId", "permissionKey", "scope", "updatedAt")
SELECT CONCAT(r."id", '_', REPLACE(p.key, '.', '_')), r."id", p.key,
  CASE
    WHEN r.key IN ('owner', 'co_owner', 'administrator') THEN 'COMPANY_WIDE'::"PermissionScope"
    WHEN r.key = 'manager' THEN 'COMPANY_WIDE'::"PermissionScope"
    WHEN r.key IN ('supervisor', 'team_lead') THEN 'TEAM'::"PermissionScope"
    WHEN p.key LIKE 'chat.%' OR p.key = 'chat.use' THEN 'COMPANY_WIDE'::"PermissionScope"
    ELSE 'OWN'::"PermissionScope"
  END,
  CURRENT_TIMESTAMP
FROM "Rank" r
CROSS JOIN (VALUES
  ('company.manage'), ('ranks.manage'), ('people.view'), ('people.manage'),
  ('invites.manage'), ('organization.manage'), ('tasks.view'), ('tasks.create'),
  ('tasks.manage'), ('tasks.delete'), ('schedule.view'), ('schedule.manage'),
  ('availability.manage'), ('knowledge.view'), ('knowledge.manage'), ('activity.view'),
  ('metrics.view'), ('chat.use'), ('chat.company.read'), ('chat.company.post'),
  ('atlasy.use'), ('atlasy.briefing')
) AS p(key)
WHERE
  r.key IN ('owner', 'co_owner', 'administrator')
  OR (r.key = 'manager' AND p.key NOT IN ('company.manage', 'ranks.manage'))
  OR (r.key IN ('supervisor', 'team_lead') AND p.key IN (
    'people.view', 'people.manage', 'organization.manage', 'tasks.view', 'tasks.create',
    'tasks.manage', 'tasks.delete', 'schedule.view', 'schedule.manage',
    'availability.manage', 'knowledge.view', 'knowledge.manage', 'activity.view',
    'metrics.view', 'chat.use', 'chat.company.read', 'chat.company.post',
    'atlasy.use', 'atlasy.briefing'
  ))
  OR (r.key IN ('worker', 'contractor', 'guest') AND p.key IN (
    'people.view', 'tasks.view', 'tasks.manage', 'schedule.view', 'chat.use',
    'chat.company.read', 'chat.company.post', 'atlasy.use'
  ));

ALTER TABLE "Membership" ALTER COLUMN "rankId" SET NOT NULL;

CREATE UNIQUE INDEX "Rank_companyId_key_key" ON "Rank"("companyId", "key");
CREATE UNIQUE INDEX "Rank_companyId_name_key" ON "Rank"("companyId", "name");
CREATE INDEX "Rank_companyId_position_idx" ON "Rank"("companyId", "position");
CREATE UNIQUE INDEX "RankPermission_rankId_permissionKey_scope_key" ON "RankPermission"("rankId", "permissionKey", "scope");
CREATE INDEX "RankPermission_rankId_permissionKey_idx" ON "RankPermission"("rankId", "permissionKey");
CREATE INDEX "PermissionAuditLog_companyId_createdAt_idx" ON "PermissionAuditLog"("companyId", "createdAt");
CREATE INDEX "PermissionAuditLog_affectedMembershipId_createdAt_idx" ON "PermissionAuditLog"("affectedMembershipId", "createdAt");
CREATE INDEX "PermissionAuditLog_affectedRankId_createdAt_idx" ON "PermissionAuditLog"("affectedRankId", "createdAt");
CREATE INDEX "Membership_rankId_idx" ON "Membership"("rankId");

ALTER TABLE "Rank" ADD CONSTRAINT "Rank_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RankPermission" ADD CONSTRAINT "RankPermission_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "Rank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermissionAuditLog" ADD CONSTRAINT "PermissionAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermissionAuditLog" ADD CONSTRAINT "PermissionAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PermissionAuditLog" ADD CONSTRAINT "PermissionAuditLog_affectedMembershipId_fkey" FOREIGN KEY ("affectedMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PermissionAuditLog" ADD CONSTRAINT "PermissionAuditLog_affectedRankId_fkey" FOREIGN KEY ("affectedRankId") REFERENCES "Rank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "Rank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
