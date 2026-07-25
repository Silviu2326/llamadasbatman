ALTER TABLE "WebhookEvent"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "errorCode" TEXT;

CREATE INDEX "WebhookEvent_status_lastAttemptAt_idx"
  ON "WebhookEvent"("status", "lastAttemptAt");

CREATE INDEX "WebhookEvent_orgId_correlationId_idx"
  ON "WebhookEvent"("orgId", "correlationId");
