-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "acquisitionSharePct" INTEGER,
ADD COLUMN     "marginPerSaleCents" INTEGER;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "metaAdId" TEXT,
ADD COLUMN     "metaAdSetId" TEXT;

-- CreateTable
CREATE TABLE "AdConversionSignal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "campaignId" TEXT,
    "stage" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "hashedIdentifiers" JSONB,
    "valueCents" INTEGER,
    "currency" TEXT,
    "consentStatus" TEXT NOT NULL,
    "consentSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "providerResponse" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdConversionSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdConversionSignal_orgId_status_createdAt_idx" ON "AdConversionSignal"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AdConversionSignal_orgId_stage_createdAt_idx" ON "AdConversionSignal"("orgId", "stage", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdConversionSignal_orgId_eventId_key" ON "AdConversionSignal"("orgId", "eventId");

-- AddForeignKey
ALTER TABLE "AdConversionSignal" ADD CONSTRAINT "AdConversionSignal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdConversionSignal" ADD CONSTRAINT "AdConversionSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdConversionSignal" ADD CONSTRAINT "AdConversionSignal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
