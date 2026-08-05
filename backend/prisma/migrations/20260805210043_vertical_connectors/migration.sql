-- AlterTable
ALTER TABLE "OrganicOpportunity" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'search',
ADD COLUMN     "connectorId" TEXT,
ADD COLUMN     "sourceKind" TEXT NOT NULL DEFAULT 'query';

-- CreateTable
CREATE TABLE "VerticalConnector" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'webhook',
    "endpoint" TEXT,
    "secretEnc" TEXT,
    "webhookSecretEnc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastEventAt" TIMESTAMP(3),
    "lastError" TEXT,
    "eventsReceived" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerticalConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerticalEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "opportunityId" TEXT,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerticalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerticalConnector_orgId_status_idx" ON "VerticalConnector"("orgId", "status");

-- CreateIndex
CREATE INDEX "VerticalConnector_projectId_moduleKey_idx" ON "VerticalConnector"("projectId", "moduleKey");

-- CreateIndex
CREATE INDEX "VerticalEvent_orgId_status_occurredAt_idx" ON "VerticalEvent"("orgId", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerticalEvent_connectorId_externalId_key" ON "VerticalEvent"("connectorId", "externalId");

-- AddForeignKey
ALTER TABLE "VerticalConnector" ADD CONSTRAINT "VerticalConnector_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerticalConnector" ADD CONSTRAINT "VerticalConnector_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerticalEvent" ADD CONSTRAINT "VerticalEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerticalEvent" ADD CONSTRAINT "VerticalEvent_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "VerticalConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
