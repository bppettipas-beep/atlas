ALTER TABLE "User"
  ADD COLUMN "accountPlan" "SubscriptionPlan",
  ADD COLUMN "accountSubscriptionStatus" "SubscriptionStatus",
  ADD COLUMN "accountSubscriptionExpiresAt" TIMESTAMP(3);
