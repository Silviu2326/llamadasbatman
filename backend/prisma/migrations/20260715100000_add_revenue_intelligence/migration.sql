-- Revenue Intelligence: next best action enrichment, experiments, operational
-- memory proposals and organization-scoped governance policies. This migration
-- is additive so existing conversation suggestions keep working unchanged.
ALTER TABLE "NextBestAction"
  ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "message" TEXT,
  ADD COLUMN "recommendedFor" TIMESTAMP(3);

CREATE INDEX "NextBestAction_orgId_status_recommendedFor_idx"
  ON "NextBestAction"("orgId", "status", "recommendedFor");

CREATE TABLE "RevenueExperiment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "createdById" TEXT,
  "name" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "primaryMetric" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "audienceDefinition" JSONB,
  "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
  "budgetCents" INTEGER,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RevenueExperiment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RevenueExperimentVariant" (
  "id" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isControl" BOOLEAN NOT NULL DEFAULT false,
  "allocation" INTEGER NOT NULL DEFAULT 50,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RevenueExperimentVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RevenueExperimentAssignment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "subjectKey" TEXT NOT NULL,
  "leadId" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "exposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "convertedAt" TIMESTAMP(3),
  "conversionType" TEXT,
  "attributedRevenue" DECIMAL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RevenueExperimentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalMemoryProposal" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "createdById" TEXT,
  "reviewedById" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence" JSONB,
  "proposedChange" JSONB,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "reviewComment" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalMemoryProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernancePolicy" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueExperimentVariant_experimentId_key_key"
  ON "RevenueExperimentVariant"("experimentId", "key");
CREATE UNIQUE INDEX "RevenueExperimentAssignment_experimentId_subjectKey_key"
  ON "RevenueExperimentAssignment"("experimentId", "subjectKey");
CREATE UNIQUE INDEX "GovernancePolicy_orgId_key_key"
  ON "GovernancePolicy"("orgId", "key");

CREATE INDEX "RevenueExperiment_orgId_status_updatedAt_idx"
  ON "RevenueExperiment"("orgId", "status", "updatedAt");
CREATE INDEX "RevenueExperiment_orgId_surface_status_idx"
  ON "RevenueExperiment"("orgId", "surface", "status");
CREATE INDEX "RevenueExperimentVariant_experimentId_isControl_idx"
  ON "RevenueExperimentVariant"("experimentId", "isControl");
CREATE INDEX "RevenueExperimentAssignment_orgId_experimentId_convertedAt_idx"
  ON "RevenueExperimentAssignment"("orgId", "experimentId", "convertedAt");
CREATE INDEX "RevenueExperimentAssignment_orgId_leadId_idx"
  ON "RevenueExperimentAssignment"("orgId", "leadId");
CREATE INDEX "RevenueExperimentAssignment_variantId_convertedAt_idx"
  ON "RevenueExperimentAssignment"("variantId", "convertedAt");
CREATE INDEX "OperationalMemoryProposal_orgId_status_updatedAt_idx"
  ON "OperationalMemoryProposal"("orgId", "status", "updatedAt");
CREATE INDEX "OperationalMemoryProposal_orgId_targetType_targetId_idx"
  ON "OperationalMemoryProposal"("orgId", "targetType", "targetId");
CREATE INDEX "OperationalMemoryProposal_orgId_sourceType_sourceId_idx"
  ON "OperationalMemoryProposal"("orgId", "sourceType", "sourceId");
CREATE INDEX "GovernancePolicy_orgId_updatedAt_idx"
  ON "GovernancePolicy"("orgId", "updatedAt");

ALTER TABLE "RevenueExperiment"
  ADD CONSTRAINT "RevenueExperiment_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RevenueExperiment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RevenueExperimentVariant"
  ADD CONSTRAINT "RevenueExperimentVariant_experimentId_fkey"
  FOREIGN KEY ("experimentId") REFERENCES "RevenueExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RevenueExperimentAssignment"
  ADD CONSTRAINT "RevenueExperimentAssignment_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RevenueExperimentAssignment_experimentId_fkey"
  FOREIGN KEY ("experimentId") REFERENCES "RevenueExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RevenueExperimentAssignment_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "RevenueExperimentVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationalMemoryProposal"
  ADD CONSTRAINT "OperationalMemoryProposal_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationalMemoryProposal_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationalMemoryProposal_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancePolicy"
  ADD CONSTRAINT "GovernancePolicy_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
