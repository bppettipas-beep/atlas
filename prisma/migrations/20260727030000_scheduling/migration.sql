-- AlterTable
-- `startAt` already existed and already meant "when this work starts", so the
-- Schedule reuses it rather than introducing a second scheduled-start column
-- that would have to be kept in step with it.
ALTER TABLE "Task" ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "scheduledById" TEXT;

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkingHours_companyId_idx" ON "WorkingHours"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHours_membershipId_weekday_key" ON "WorkingHours"("membershipId", "weekday");

-- CreateIndex
CREATE INDEX "TimeOff_companyId_startAt_idx" ON "TimeOff"("companyId", "startAt");

-- CreateIndex
CREATE INDEX "TimeOff_membershipId_startAt_idx" ON "TimeOff"("membershipId", "startAt");

-- CreateIndex
CREATE INDEX "Task_companyId_startAt_idx" ON "Task"("companyId", "startAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
