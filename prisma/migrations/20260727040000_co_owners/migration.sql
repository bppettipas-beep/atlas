-- Co-owners share the owner's operational authority, while preserving the
-- original OWNER rank as the highest visible company rank.
ALTER TYPE "CompanyRole" ADD VALUE IF NOT EXISTS 'CO_OWNER' AFTER 'OWNER';
