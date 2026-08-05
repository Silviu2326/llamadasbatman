-- CreateTable
CREATE TABLE "AdRuleAutonomy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "autonomyLevel" TEXT NOT NULL DEFAULT 'N1',
    "decisionsRaised" INTEGER NOT NULL DEFAULT 0,
    "decisionsApproved" INTEGER NOT NULL DEFAULT 0,
    "decisionsRejected" INTEGER NOT NULL DEFAULT 0,
    "actionsExecuted" INTEGER NOT NULL DEFAULT 0,
    "actionsFailed" INTEGER NOT NULL DEFAULT 0,
    "canaryPercent" INTEGER NOT NULL DEFAULT 10,
    "promotedAt" TIMESTAMP(3),
    "promotedByUserId" TEXT,
    "degradedAt" TIMESTAMP(3),
    "degradedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdRuleAutonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdExperiment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'bandit',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "primaryMetric" TEXT NOT NULL DEFAULT 'qualified_lead',
    "explorePercent" INTEGER NOT NULL DEFAULT 15,
    "minEventsPerVariant" INTEGER NOT NULL DEFAULT 30,
    "minDurationDays" INTEGER NOT NULL DEFAULT 14,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "conclusion" TEXT,
    "winnerVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdExperimentVariant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "metaAdId" TEXT,
    "allocationPercent" INTEGER NOT NULL DEFAULT 50,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "leads" INTEGER,
    "qualified" INTEGER,
    "sales" INTEGER,
    "spendCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdRuleAutonomy_orgId_autonomyLevel_idx" ON "AdRuleAutonomy"("orgId", "autonomyLevel");

-- CreateIndex
CREATE UNIQUE INDEX "AdRuleAutonomy_orgId_ruleKey_key" ON "AdRuleAutonomy"("orgId", "ruleKey");

-- CreateIndex
CREATE INDEX "AdExperiment_orgId_status_createdAt_idx" ON "AdExperiment"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AdExperimentVariant_orgId_experimentId_idx" ON "AdExperimentVariant"("orgId", "experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "AdExperimentVariant_experimentId_key_key" ON "AdExperimentVariant"("experimentId", "key");

-- AddForeignKey
ALTER TABLE "AdRuleAutonomy" ADD CONSTRAINT "AdRuleAutonomy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdRuleAutonomy" ADD CONSTRAINT "AdRuleAutonomy_promotedByUserId_fkey" FOREIGN KEY ("promotedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdExperiment" ADD CONSTRAINT "AdExperiment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdExperiment" ADD CONSTRAINT "AdExperiment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdExperimentVariant" ADD CONSTRAINT "AdExperimentVariant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdExperimentVariant" ADD CONSTRAINT "AdExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "AdExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
