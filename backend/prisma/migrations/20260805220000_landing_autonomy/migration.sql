-- CreateTable
CREATE TABLE "LandingAutonomyDecision" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "diagnosisType" TEXT,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'shadow',
    "changeType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "revertPatch" JSONB,
    "guardrails" JSONB NOT NULL,
    "blockedReason" TEXT,
    "policyVersion" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "safetyMetric" TEXT,
    "safetyBaseline" DOUBLE PRECISION,
    "observationUntil" TIMESTAMP(3),
    "outcome" JSONB,
    "humanFeedback" TEXT,
    "actorUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingAutonomyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingAutonomyDecision_orgId_status_createdAt_idx" ON "LandingAutonomyDecision"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LandingAutonomyDecision_landingKey_status_idx" ON "LandingAutonomyDecision"("landingKey", "status");

-- AddForeignKey
ALTER TABLE "LandingAutonomyDecision" ADD CONSTRAINT "LandingAutonomyDecision_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingAutonomyDecision" ADD CONSTRAINT "LandingAutonomyDecision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingAutonomyDecision" ADD CONSTRAINT "LandingAutonomyDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

