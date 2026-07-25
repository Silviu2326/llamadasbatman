ALTER TABLE "Call" ADD COLUMN "contactClassification" TEXT;
ALTER TABLE "Call" ADD COLUMN "contactClassificationConfidence" DOUBLE PRECISION;
ALTER TABLE "Call" ADD COLUMN "amdResult" JSONB;

CREATE TABLE "VoiceCallEvaluation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "overall" INTEGER,
    "rubricVersion" TEXT NOT NULL,
    "judgeProvider" TEXT NOT NULL,
    "judgeModel" TEXT NOT NULL,
    "dimensions" JSONB,
    "criticalErrors" JSONB,
    "evidence" JSONB,
    "trainingTag" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceCallEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceCallEvaluation_callId_key" ON "VoiceCallEvaluation"("callId");
CREATE INDEX "VoiceCallEvaluation_orgId_status_createdAt_idx" ON "VoiceCallEvaluation"("orgId", "status", "createdAt");

ALTER TABLE "VoiceCallEvaluation" ADD CONSTRAINT "VoiceCallEvaluation_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCallEvaluation" ADD CONSTRAINT "VoiceCallEvaluation_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
