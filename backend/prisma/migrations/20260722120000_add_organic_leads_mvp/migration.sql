-- Organic Leads MVP. No provider secrets are persisted in these tables.
CREATE TABLE "OrganicProject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "locations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "averageLeadValueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganicProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganicOpportunity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "query" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "score" INTEGER,
    "estimatedValueCents" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceKey" TEXT,
    "metadata" JSONB,
    "leadId" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganicOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganicAsset" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" JSONB,
    "targetUrl" TEXT,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganicAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganicAction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganicAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganicIntegration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "externalPropertyId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganicIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganicProject_orgId_key" ON "OrganicProject"("orgId");
CREATE UNIQUE INDEX "OrganicOpportunity_orgId_projectId_source_sourceKey_key" ON "OrganicOpportunity"("orgId", "projectId", "source", "sourceKey");
CREATE INDEX "OrganicOpportunity_orgId_projectId_status_updatedAt_idx" ON "OrganicOpportunity"("orgId", "projectId", "status", "updatedAt");
CREATE INDEX "OrganicOpportunity_orgId_projectId_score_idx" ON "OrganicOpportunity"("orgId", "projectId", "score");
CREATE INDEX "OrganicOpportunity_leadId_idx" ON "OrganicOpportunity"("leadId");
CREATE INDEX "OrganicAsset_orgId_projectId_status_updatedAt_idx" ON "OrganicAsset"("orgId", "projectId", "status", "updatedAt");
CREATE INDEX "OrganicAsset_opportunityId_idx" ON "OrganicAsset"("opportunityId");
CREATE INDEX "OrganicAction_orgId_projectId_status_priority_updatedAt_idx" ON "OrganicAction"("orgId", "projectId", "status", "priority", "updatedAt");
CREATE INDEX "OrganicAction_opportunityId_idx" ON "OrganicAction"("opportunityId");
CREATE UNIQUE INDEX "OrganicIntegration_orgId_projectId_provider_key" ON "OrganicIntegration"("orgId", "projectId", "provider");
CREATE INDEX "OrganicIntegration_orgId_projectId_status_idx" ON "OrganicIntegration"("orgId", "projectId", "status");

ALTER TABLE "OrganicProject" ADD CONSTRAINT "OrganicProject_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicOpportunity" ADD CONSTRAINT "OrganicOpportunity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicOpportunity" ADD CONSTRAINT "OrganicOpportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicOpportunity" ADD CONSTRAINT "OrganicOpportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganicOpportunity" ADD CONSTRAINT "OrganicOpportunity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganicAsset" ADD CONSTRAINT "OrganicAsset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicAsset" ADD CONSTRAINT "OrganicAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicAsset" ADD CONSTRAINT "OrganicAsset_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "OrganicOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganicAction" ADD CONSTRAINT "OrganicAction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicAction" ADD CONSTRAINT "OrganicAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicAction" ADD CONSTRAINT "OrganicAction_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "OrganicOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganicIntegration" ADD CONSTRAINT "OrganicIntegration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganicIntegration" ADD CONSTRAINT "OrganicIntegration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
