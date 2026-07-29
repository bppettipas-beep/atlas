ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the existing operator account without continuing to authorize by
-- mutable, unverified email at request time.
UPDATE "User"
SET "isPlatformAdmin" = true
WHERE LOWER("email") = 'bppettipas@gmail.com';
