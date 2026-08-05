-- AlterTable
ALTER TABLE "AdInsightSnapshot" ADD COLUMN     "frequency" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "AdDecision" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT,
    "diagnosis" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL DEFAULT '1',
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'advisory',
    "mode" TEXT NOT NULL DEFAULT 'shadow',
    "autonomyLevel" TEXT NOT NULL DEFAULT 'N1',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "confidence" TEXT NOT NULL,
    "confidenceReason" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "hypotheticalAction" JSONB,
    "evidence" JSONB NOT NULL,
    "cohortStatus" TEXT NOT NULL DEFAULT 'insufficient',
    "signalUsed" TEXT,
    "actorUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdDecision_orgId_status_createdAt_idx" ON "AdDecision"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AdDecision_campaignId_createdAt_idx" ON "AdDecision"("campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdDecision_orgId_dedupeKey_key" ON "AdDecision"("orgId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "AdDecision" ADD CONSTRAINT "AdDecision_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDecision" ADD CONSTRAINT "AdDecision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDecision" ADD CONSTRAINT "AdDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
