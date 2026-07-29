-- The rank foundation may already have been applied on a development database
-- before its default grants were added. Restore defaults only for system ranks
-- that have no grants at all, so a deliberately customized rank is untouched.
INSERT INTO "RankPermission" (
  "id",
  "rankId",
  "permissionKey",
  "scope",
  "selectedTeamIds",
  "updatedAt"
)
SELECT
  CONCAT(r."id", '_', REPLACE(p.key, '.', '_')),
  r."id",
  p.key,
  CASE
    WHEN r.key IN ('owner', 'co_owner', 'administrator', 'manager')
      THEN 'COMPANY_WIDE'::"PermissionScope"
    WHEN r.key IN ('supervisor', 'team_lead')
      THEN 'TEAM'::"PermissionScope"
    WHEN p.key LIKE 'chat.%' OR p.key = 'chat.use'
      THEN 'COMPANY_WIDE'::"PermissionScope"
    ELSE 'OWN'::"PermissionScope"
  END,
  ARRAY[]::TEXT[],
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
WHERE r."isSystem" = true
  AND NOT EXISTS (
    SELECT 1 FROM "RankPermission" existing WHERE existing."rankId" = r."id"
  )
  AND (
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
    ))
  )
ON CONFLICT ("rankId", "permissionKey", "scope") DO NOTHING;
