-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "landingKey" TEXT;

-- CreateTable
CREATE TABLE "LandingVersion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "slug" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "landingVersionId" TEXT NOT NULL,
    "experimentId" TEXT,
    "variantId" TEXT,
    "visitorId" TEXT,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "filled" BOOLEAN,
    "value" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "medium" TEXT,
    "utmCampaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "referrer" TEXT,
    "device" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingDailyRollup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "landingVersionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL DEFAULT '',
    "day" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "device" TEXT NOT NULL DEFAULT 'unknown',
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "scroll50" INTEGER NOT NULL DEFAULT 0,
    "scroll90" INTEGER NOT NULL DEFAULT 0,
    "ctaClicks" INTEGER NOT NULL DEFAULT 0,
    "formStarts" INTEGER NOT NULL DEFAULT 0,
    "formSubmits" INTEGER NOT NULL DEFAULT 0,
    "fieldStats" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "visits" INTEGER,
    "leads" INTEGER,
    "qualified" INTEGER,
    "opportunities" INTEGER,
    "sales" INTEGER,
    "revenueCents" INTEGER,
    "attributionCoverage" DOUBLE PRECISION,
    "maturity" TEXT NOT NULL DEFAULT 'insufficient',
    "confidence" TEXT NOT NULL DEFAULT 'none',
    "baseline" JSONB,
    "funnel" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingPerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingVersion_orgId_campaignId_publishedAt_idx" ON "LandingVersion"("orgId", "campaignId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LandingVersion_landingKey_version_key" ON "LandingVersion"("landingKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LandingVersion_landingKey_contentHash_key" ON "LandingVersion"("landingKey", "contentHash");

-- CreateIndex
CREATE INDEX "LandingEvent_orgId_landingKey_occurredAt_idx" ON "LandingEvent"("orgId", "landingKey", "occurredAt");

-- CreateIndex
CREATE INDEX "LandingEvent_landingVersionId_type_occurredAt_idx" ON "LandingEvent"("landingVersionId", "type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LandingEvent_sessionId_type_field_key" ON "LandingEvent"("sessionId", "type", "field");

-- CreateIndex
CREATE INDEX "LandingDailyRollup_orgId_day_idx" ON "LandingDailyRollup"("orgId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "LandingDailyRollup_landingKey_landingVersionId_variantId_da_key" ON "LandingDailyRollup"("landingKey", "landingVersionId", "variantId", "day", "source", "device");

-- CreateIndex
CREATE INDEX "LandingPerformanceSnapshot_orgId_computedAt_idx" ON "LandingPerformanceSnapshot"("orgId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPerformanceSnapshot_landingKey_periodStart_periodEnd_key" ON "LandingPerformanceSnapshot"("landingKey", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_landingKey_key" ON "Campaign"("landingKey");

-- AddForeignKey
ALTER TABLE "LandingVersion" ADD CONSTRAINT "LandingVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingVersion" ADD CONSTRAINT "LandingVersion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingEvent" ADD CONSTRAINT "LandingEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingEvent" ADD CONSTRAINT "LandingEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingEvent" ADD CONSTRAINT "LandingEvent_landingVersionId_fkey" FOREIGN KEY ("landingVersionId") REFERENCES "LandingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingDailyRollup" ADD CONSTRAINT "LandingDailyRollup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingDailyRollup" ADD CONSTRAINT "LandingDailyRollup_landingVersionId_fkey" FOREIGN KEY ("landingVersionId") REFERENCES "LandingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPerformanceSnapshot" ADD CONSTRAINT "LandingPerformanceSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPerformanceSnapshot" ADD CONSTRAINT "LandingPerformanceSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

