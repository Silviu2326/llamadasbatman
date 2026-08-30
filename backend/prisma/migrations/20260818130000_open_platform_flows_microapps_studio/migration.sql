-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowVersion" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowCapabilityDependency" (
    "id" TEXT NOT NULL,
    "flowVersionId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "pinnedProvider" TEXT,

    CONSTRAINT "FlowCapabilityDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "trigger" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "budgetCents" INTEGER,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "error" JSONB,
    "leaseExpiresAt" TIMESTAMP(3),
    "workerId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowStepRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "flowRunId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "jobId" TEXT,
    "approvalRequestId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FlowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroappRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "microappId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "staleAt" TIMESTAMP(3),
    "leadId" TEXT,
    "accountId" TEXT,
    "productionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicroappRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentGrant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "subjectContact" TEXT,
    "kind" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "evidenceAssetId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceRef" JSONB NOT NULL,
    "valueCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Production" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'brief',
    "brief" JSONB NOT NULL,
    "budgetCents" INTEGER,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "brandScope" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT NOT NULL,
    "treatment" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBibleEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "refAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentGrantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionBibleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "scriptText" JSONB NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "storyboardAssetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Take" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'draft',
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "qcReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Take_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Flow_orgId_slug_key" ON "Flow"("orgId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "FlowVersion_flowId_version_key" ON "FlowVersion"("flowId", "version");

-- CreateIndex
CREATE INDEX "FlowCapabilityDependency_capability_pinnedProvider_idx" ON "FlowCapabilityDependency"("capability", "pinnedProvider");

-- CreateIndex
CREATE INDEX "FlowRun_orgId_status_startedAt_idx" ON "FlowRun"("orgId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "FlowRun_status_leaseExpiresAt_idx" ON "FlowRun"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "FlowStepRun_orgId_status_idx" ON "FlowStepRun"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FlowStepRun_flowRunId_nodeKey_key" ON "FlowStepRun"("flowRunId", "nodeKey");

-- CreateIndex
CREATE UNIQUE INDEX "MicroappRun_jobId_key" ON "MicroappRun"("jobId");

-- CreateIndex
CREATE INDEX "MicroappRun_orgId_microappId_createdAt_idx" ON "MicroappRun"("orgId", "microappId", "createdAt");

-- CreateIndex
CREATE INDEX "MicroappRun_leadId_idx" ON "MicroappRun"("leadId");

-- CreateIndex
CREATE INDEX "MicroappRun_accountId_idx" ON "MicroappRun"("accountId");

-- CreateIndex
CREATE INDEX "ConsentGrant_orgId_kind_status_idx" ON "ConsentGrant"("orgId", "kind", "status");

-- CreateIndex: supports tenant-safe FK from Asset(consentGrantId, orgId).
CREATE UNIQUE INDEX "ConsentGrant_id_orgId_key" ON "ConsentGrant"("id", "orgId");

-- CreateIndex
CREATE INDEX "OutcomeEvent_orgId_kind_createdAt_idx" ON "OutcomeEvent"("orgId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Production_orgId_status_idx" ON "Production"("orgId", "status");

-- CreateIndex
CREATE INDEX "Concept_orgId_productionId_idx" ON "Concept"("orgId", "productionId");

-- CreateIndex
CREATE INDEX "ProductionBibleEntry_orgId_productionId_kind_idx" ON "ProductionBibleEntry"("orgId", "productionId", "kind");

-- CreateIndex
CREATE INDEX "Scene_orgId_productionId_order_idx" ON "Scene"("orgId", "productionId", "order");

-- CreateIndex
CREATE INDEX "Shot_orgId_sceneId_order_idx" ON "Shot"("orgId", "sceneId", "order");

-- CreateIndex
CREATE INDEX "Take_orgId_shotId_idx" ON "Take"("orgId", "shotId");

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowCapabilityDependency" ADD CONSTRAINT "FlowCapabilityDependency_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowStepRun" ADD CONSTRAINT "FlowStepRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowStepRun" ADD CONSTRAINT "FlowStepRun_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroappRun" ADD CONSTRAINT "MicroappRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentGrant" ADD CONSTRAINT "ConsentGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: an asset cannot reference consent belonging to another org.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_consentGrantId_orgId_fkey" FOREIGN KEY ("consentGrantId", "orgId") REFERENCES "ConsentGrant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBibleEntry" ADD CONSTRAINT "ProductionBibleEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBibleEntry" ADD CONSTRAINT "ProductionBibleEntry_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Take" ADD CONSTRAINT "Take_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Take" ADD CONSTRAINT "Take_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
