-- Voice Engine 2.1: append-only event timeline and metric aggregates.
ALTER TABLE "Call" ADD COLUMN "runtimeSnapshot" JSONB;

CREATE TABLE "VoiceCallEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "atMs" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT,
    "payload" JSONB NOT NULL,
    "component" TEXT,
    "componentVer" TEXT,
    "model" TEXT,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceCallEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceCallMetric" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "sampleCount" INTEGER,
    "dimensions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceCallMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceCallEvent_callId_seq_key" ON "VoiceCallEvent"("callId", "seq");
CREATE INDEX "VoiceCallEvent_orgId_createdAt_idx" ON "VoiceCallEvent"("orgId", "createdAt");
CREATE INDEX "VoiceCallEvent_callId_atMs_idx" ON "VoiceCallEvent"("callId", "atMs");
CREATE INDEX "VoiceCallEvent_callId_type_idx" ON "VoiceCallEvent"("callId", "type");
CREATE INDEX "VoiceCallMetric_orgId_metric_createdAt_idx" ON "VoiceCallMetric"("orgId", "metric", "createdAt");
CREATE INDEX "VoiceCallMetric_callId_metric_idx" ON "VoiceCallMetric"("callId", "metric");

ALTER TABLE "VoiceCallEvent" ADD CONSTRAINT "VoiceCallEvent_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCallEvent" ADD CONSTRAINT "VoiceCallEvent_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCallMetric" ADD CONSTRAINT "VoiceCallMetric_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCallMetric" ADD CONSTRAINT "VoiceCallMetric_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
