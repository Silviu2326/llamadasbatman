/*
  Warnings:

  - You are about to alter the column `attributedRevenue` on the `RevenueExperimentAssignment` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.

*/
-- AlterTable
ALTER TABLE "RevenueExperimentAssignment" ALTER COLUMN "attributedRevenue" SET DATA TYPE DECIMAL(65,30);

-- CreateTable
CREATE TABLE "AdDataQualityStatus" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountStatus" TEXT NOT NULL,
    "permissionsInsights" BOOLEAN NOT NULL DEFAULT false,
    "permissionsLeads" BOOLEAN NOT NULL DEFAULT false,
    "permissionsCapi" BOOLEAN NOT NULL DEFAULT false,
    "missingScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingAssets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastValidatedAt" TIMESTAMP(3),
    "lastSnapshotAt" TIMESTAMP(3),
    "snapshotDelayMinutes" INTEGER,
    "attributionCoveragePct" INTEGER,
    "adLevelCoveragePct" INTEGER,
    "unattributedLeads" INTEGER,
    "duplicateRatePct" INTEGER,
    "consentStatus" TEXT NOT NULL DEFAULT 'unknown',
    "consentCoveragePct" INTEGER,
    "consentRevoked" INTEGER,
    "capiStatus" TEXT NOT NULL DEFAULT 'unknown',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "blocksDeepMetrics" BOOLEAN NOT NULL DEFAULT false,
    "blocksAutomation" BOOLEAN NOT NULL DEFAULT false,
    "issues" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "AdDataQualityStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdDataQualityStatus_orgId_key" ON "AdDataQualityStatus"("orgId");

-- CreateIndex
CREATE INDEX "AdDataQualityStatus_orgId_computedAt_idx" ON "AdDataQualityStatus"("orgId", "computedAt");

-- AddForeignKey
ALTER TABLE "AdDataQualityStatus" ADD CONSTRAINT "AdDataQualityStatus_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
-- IF EXISTS: en las bases que se crearon después del baseline el índice ya nace
-- con el nombre final y el rename no tiene nada que renombrar.
ALTER INDEX IF EXISTS "SensitiveApprovalRequest_orgId_action_resourceType_resourceId_s" RENAME TO "SensitiveApprovalRequest_orgId_action_resourceType_resource_idx";
