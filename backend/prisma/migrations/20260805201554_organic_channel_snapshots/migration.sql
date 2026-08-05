-- CreateTable
CREATE TABLE "OrganicChannelSnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "presence" INTEGER,
    "presenceUnit" TEXT,
    "visits" INTEGER,
    "leads" INTEGER,
    "qualified" INTEGER,
    "opportunities" INTEGER,
    "sales" INTEGER,
    "revenueCents" INTEGER,
    "hoursInvested" DOUBLE PRECISION,
    "cohortStatus" TEXT NOT NULL DEFAULT 'insufficient',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganicChannelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganicChannelSnapshot_orgId_periodKey_idx" ON "OrganicChannelSnapshot"("orgId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrganicChannelSnapshot_projectId_channel_periodKey_key" ON "OrganicChannelSnapshot"("projectId", "channel", "periodKey");

-- AddForeignKey
ALTER TABLE "OrganicChannelSnapshot" ADD CONSTRAINT "OrganicChannelSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganicChannelSnapshot" ADD CONSTRAINT "OrganicChannelSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
