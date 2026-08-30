-- API pública: claves por organización y suscripciones a eventos del outbox.
CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_orgId_revokedAt_idx" ON "ApiKey"("orgId", "revokedAt");
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookSubscription" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "createdById" TEXT,
  "lastStatus" INTEGER,
  "lastError" TEXT,
  "lastDeliveredAt" TIMESTAMP(3),
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookSubscription_orgId_topic_targetUrl_key" ON "WebhookSubscription"("orgId", "topic", "targetUrl");
CREATE INDEX "WebhookSubscription_orgId_topic_disabledAt_idx" ON "WebhookSubscription"("orgId", "topic", "disabledAt");
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
