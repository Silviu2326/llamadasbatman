-- AlterTable
ALTER TABLE "AdDecision" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'ads',
ADD COLUMN     "dispatchArm" TEXT,
ADD COLUMN     "dispatchContext" JSONB,
ADD COLUMN     "estimatedHours" DOUBLE PRECISION,
ADD COLUMN     "priorityScore" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "AdDecision_orgId_channel_status_idx" ON "AdDecision"("orgId", "channel", "status");
