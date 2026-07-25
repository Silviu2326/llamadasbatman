-- Durable sales_sequence runtime. This migration is intentionally created but
-- must be reviewed/applied only by the staging/production migration process.

CREATE TABLE "SalesSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRespondedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesSequenceStepRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "workerId" TEXT,
    "providerAttemptedAt" TIMESTAMP(3),
    "emailDeliveryId" TEXT,
    "meetingId" TEXT,
    "taskId" TEXT,
    "output" JSONB,
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesSequenceStepRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesSequenceEnrollment_programId_leadId_key"
    ON "SalesSequenceEnrollment"("programId", "leadId");
CREATE INDEX "SalesSequenceEnrollment_orgId_status_nextRunAt_idx"
    ON "SalesSequenceEnrollment"("orgId", "status", "nextRunAt");
CREATE INDEX "SalesSequenceEnrollment_orgId_leadId_status_idx"
    ON "SalesSequenceEnrollment"("orgId", "leadId", "status");

CREATE UNIQUE INDEX "SalesSequenceStepRun_emailDeliveryId_key"
    ON "SalesSequenceStepRun"("emailDeliveryId");
CREATE UNIQUE INDEX "SalesSequenceStepRun_meetingId_key"
    ON "SalesSequenceStepRun"("meetingId");
CREATE UNIQUE INDEX "SalesSequenceStepRun_taskId_key"
    ON "SalesSequenceStepRun"("taskId");
CREATE UNIQUE INDEX "SalesSequenceStepRun_enrollmentId_stepKey_key"
    ON "SalesSequenceStepRun"("enrollmentId", "stepKey");
CREATE INDEX "SalesSequenceStepRun_orgId_status_availableAt_idx"
    ON "SalesSequenceStepRun"("orgId", "status", "availableAt");
CREATE INDEX "SalesSequenceStepRun_orgId_enrollmentId_stepIndex_idx"
    ON "SalesSequenceStepRun"("orgId", "enrollmentId", "stepIndex");
CREATE INDEX "SalesSequenceStepRun_orgId_dueAt_status_idx"
    ON "SalesSequenceStepRun"("orgId", "dueAt", "status");

ALTER TABLE "SalesSequenceEnrollment"
    ADD CONSTRAINT "SalesSequenceEnrollment_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceEnrollment"
    ADD CONSTRAINT "SalesSequenceEnrollment_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "GrowthProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceEnrollment"
    ADD CONSTRAINT "SalesSequenceEnrollment_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesSequenceStepRun"
    ADD CONSTRAINT "SalesSequenceStepRun_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceStepRun"
    ADD CONSTRAINT "SalesSequenceStepRun_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "GrowthProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceStepRun"
    ADD CONSTRAINT "SalesSequenceStepRun_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "SalesSequenceEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceStepRun"
    ADD CONSTRAINT "SalesSequenceStepRun_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceStepRun"
    ADD CONSTRAINT "SalesSequenceStepRun_emailDeliveryId_fkey"
    FOREIGN KEY ("emailDeliveryId") REFERENCES "EmailDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceStepRun"
    ADD CONSTRAINT "SalesSequenceStepRun_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesSequenceStepRun"
    ADD CONSTRAINT "SalesSequenceStepRun_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
