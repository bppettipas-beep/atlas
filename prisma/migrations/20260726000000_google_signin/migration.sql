-- Google sign-in.
--
-- `passwordHash` becomes nullable: an account that only ever signs in with
-- Google has no password, and storing a placeholder would be a lie that the
-- login endpoint would eventually have to special-case anyway.
--
-- `googleId` holds Google's stable subject identifier. It is unique, but
-- PostgreSQL allows any number of NULLs in a unique index, so every existing
-- password-only account stays valid without a backfill.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
