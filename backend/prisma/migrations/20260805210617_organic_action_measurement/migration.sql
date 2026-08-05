-- AlterTable
ALTER TABLE "OrganicAction" ADD COLUMN     "arm" TEXT,
ADD COLUMN     "baselineValue" DOUBLE PRECISION,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "decisionId" TEXT,
ADD COLUMN     "evaluatedAt" TIMESTAMP(3),
ADD COLUMN     "expectedDelta" DOUBLE PRECISION,
ADD COLUMN     "maturesAt" TIMESTAMP(3),
ADD COLUMN     "observedValue" DOUBLE PRECISION,
ADD COLUMN     "outcomeStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "outcomeSummary" TEXT,
ADD COLUMN     "targetMetric" TEXT;

-- CreateTable
CREATE TABLE "OrganicRecommendationWeight" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "dispatched" INTEGER NOT NULL DEFAULT 0,
    "dismissed" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lastReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganicRecommendationWeight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganicRecommendationWeight_orgId_diagnosis_key" ON "OrganicRecommendationWeight"("orgId", "diagnosis");

-- CreateIndex
CREATE INDEX "OrganicAction_orgId_outcomeStatus_maturesAt_idx" ON "OrganicAction"("orgId", "outcomeStatus", "maturesAt");

-- AddForeignKey
ALTER TABLE "OrganicRecommendationWeight" ADD CONSTRAINT "OrganicRecommendationWeight_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
