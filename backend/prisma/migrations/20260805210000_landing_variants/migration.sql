-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "landingLifecycle" TEXT;

-- CreateTable
CREATE TABLE "LandingVariant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "baseVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "sourceDiagnosis" TEXT,
    "patch" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "experimentId" TEXT,
    "variantRecordId" TEXT,
    "approvalRequestId" TEXT,
    "createdById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingVariant_orgId_status_updatedAt_idx" ON "LandingVariant"("orgId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "LandingVariant_campaignId_status_idx" ON "LandingVariant"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LandingVariant_landingKey_key_key" ON "LandingVariant"("landingKey", "key");

-- AddForeignKey
ALTER TABLE "LandingVariant" ADD CONSTRAINT "LandingVariant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingVariant" ADD CONSTRAINT "LandingVariant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingVariant" ADD CONSTRAINT "LandingVariant_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "LandingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingVariant" ADD CONSTRAINT "LandingVariant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

