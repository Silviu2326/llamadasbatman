-- CreateEnum
CREATE TYPE "GrowthProgramType" AS ENUM ('newsletter', 'lead_magnet', 'popup', 'webinar', 'referral', 'nps', 'sales_sequence', 'proposal', 'customer_health');

-- CreateTable
CREATE TABLE "GrowthProgram" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "GrowthProgramType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "config" JSONB,
    "metrics" JSONB,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthProgram_orgId_type_archivedAt_updatedAt_idx" ON "GrowthProgram"("orgId", "type", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "GrowthProgram_orgId_status_updatedAt_idx" ON "GrowthProgram"("orgId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "GrowthProgram" ADD CONSTRAINT "GrowthProgram_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
