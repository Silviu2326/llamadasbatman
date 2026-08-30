ALTER TABLE "MicroappRun" ADD COLUMN "callId" TEXT;
ALTER TABLE "MicroappRun" ADD COLUMN "opportunityId" TEXT;
ALTER TABLE "MicroappRun" ADD COLUMN "conversationId" TEXT;
CREATE INDEX "MicroappRun_callId_idx" ON "MicroappRun"("callId");
CREATE INDEX "MicroappRun_opportunityId_idx" ON "MicroappRun"("opportunityId");
CREATE INDEX "MicroappRun_conversationId_idx" ON "MicroappRun"("conversationId");

CREATE TABLE "MicroappProjection" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT true,
  "staleAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MicroappProjection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MicroappProjection_runId_key" ON "MicroappProjection"("runId");
CREATE INDEX "MicroappProjection_orgId_surface_entityId_pinned_idx" ON "MicroappProjection"("orgId", "surface", "entityId", "pinned");
ALTER TABLE "MicroappProjection" ADD CONSTRAINT "MicroappProjection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicroappProjection" ADD CONSTRAINT "MicroappProjection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MicroappRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MicroappConfig" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "microappId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scopeId" TEXT,
  "values" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MicroappConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MicroappConfig_orgId_microappId_scope_scopeId_key" ON "MicroappConfig"("orgId", "microappId", "scope", "scopeId");
CREATE INDEX "MicroappConfig_orgId_microappId_scope_idx" ON "MicroappConfig"("orgId", "microappId", "scope");
ALTER TABLE "MicroappConfig" ADD CONSTRAINT "MicroappConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
