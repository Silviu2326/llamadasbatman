ALTER TABLE "Agent"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "monthlyMinuteLimit" INTEGER,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "AgentVersion" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changedFields" TEXT[],
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId", "version");
CREATE INDEX "AgentVersion_orgId_createdAt_idx" ON "AgentVersion"("orgId", "createdAt");
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
