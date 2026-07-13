-- CreateTable
CREATE TABLE "AcquisitionEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "medium" TEXT,
    "content" TEXT,
    "sessionId" TEXT,
    "externalKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcquisitionEvent_pkey" PRIMARY KEY ("id")
);

-- Idempotency and query indexes
CREATE UNIQUE INDEX "AcquisitionEvent_campaignId_type_sessionId_key"
    ON "AcquisitionEvent"("campaignId", "type", "sessionId");
CREATE UNIQUE INDEX "AcquisitionEvent_orgId_type_externalKey_key"
    ON "AcquisitionEvent"("orgId", "type", "externalKey");
CREATE INDEX "AcquisitionEvent_orgId_createdAt_idx"
    ON "AcquisitionEvent"("orgId", "createdAt");
CREATE INDEX "AcquisitionEvent_campaignId_createdAt_idx"
    ON "AcquisitionEvent"("campaignId", "createdAt");
CREATE INDEX "AcquisitionEvent_leadId_idx"
    ON "AcquisitionEvent"("leadId");

-- AddForeignKey
ALTER TABLE "AcquisitionEvent"
    ADD CONSTRAINT "AcquisitionEvent_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcquisitionEvent"
    ADD CONSTRAINT "AcquisitionEvent_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcquisitionEvent"
    ADD CONSTRAINT "AcquisitionEvent_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
