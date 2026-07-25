-- Durable leases let independent worker processes coordinate through Postgres.
-- A stale `processing` row can be claimed after its lease expires instead of
-- remaining stuck forever if its original process dies.
ALTER TABLE "OutboxEvent"
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "workerId" TEXT;

ALTER TABLE "ImportJob"
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "workerId" TEXT;

ALTER TABLE "EmailDelivery"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "workerId" TEXT,
  ADD COLUMN "providerAttemptedAt" TIMESTAMP(3);

CREATE INDEX "OutboxEvent_status_availableAt_leaseExpiresAt_idx"
  ON "OutboxEvent"("status", "availableAt", "leaseExpiresAt");

CREATE INDEX "ImportJob_status_availableAt_leaseExpiresAt_idx"
  ON "ImportJob"("status", "availableAt", "leaseExpiresAt");

CREATE INDEX "EmailDelivery_orgId_campaignId_status_availableAt_idx"
  ON "EmailDelivery"("orgId", "campaignId", "status", "availableAt");
