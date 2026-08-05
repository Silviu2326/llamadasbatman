-- CreateTable
CREATE TABLE "AdOptimizationPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "targetSignal" TEXT NOT NULL DEFAULT 'qualified_lead',
    "autonomyLevel" TEXT NOT NULL DEFAULT 'N1',
    "mode" TEXT NOT NULL DEFAULT 'shadow',
    "maxDailySpendCents" INTEGER,
    "maxMonthlySpendCents" INTEGER,
    "maxChangesPerDay" INTEGER NOT NULL DEFAULT 3,
    "minMinutesBetweenChanges" INTEGER NOT NULL DEFAULT 120,
    "protectLearningPhase" BOOLEAN NOT NULL DEFAULT true,
    "minCampaignBudgetCents" INTEGER,
    "maxNewLeadsPerDay" INTEGER,
    "killSwitchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "killSwitchReason" TEXT,
    "killSwitchAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdOptimizationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "target" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_execution',
    "mode" TEXT NOT NULL DEFAULT 'shadow',
    "guardrailChecks" JSONB,
    "compensationPayload" JSONB,
    "irreversibleEffects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "providerResponse" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdOptimizationPolicy_orgId_key" ON "AdOptimizationPolicy"("orgId");

-- CreateIndex
CREATE INDEX "AdAction_orgId_status_createdAt_idx" ON "AdAction"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AdAction_decisionId_idx" ON "AdAction"("decisionId");

-- AddForeignKey
ALTER TABLE "AdOptimizationPolicy" ADD CONSTRAINT "AdOptimizationPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdOptimizationPolicy" ADD CONSTRAINT "AdOptimizationPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAction" ADD CONSTRAINT "AdAction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAction" ADD CONSTRAINT "AdAction_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AdDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAction" ADD CONSTRAINT "AdAction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAction" ADD CONSTRAINT "AdAction_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
