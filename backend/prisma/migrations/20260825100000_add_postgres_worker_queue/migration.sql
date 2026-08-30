-- PostgreSQL-backed worker mode. Redis/BullMQ remains available as an
-- alternative queue backend, but local workers can now use these durable rows.
CREATE TABLE "WorkerQueueJob" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "workerId" TEXT,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkerQueueJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerQueueJob_queue_dedupeKey_key" ON "WorkerQueueJob"("queue", "dedupeKey");
CREATE INDEX "WorkerQueueJob_queue_status_availableAt_idx" ON "WorkerQueueJob"("queue", "status", "availableAt");
CREATE INDEX "WorkerQueueJob_status_leaseExpiresAt_idx" ON "WorkerQueueJob"("status", "leaseExpiresAt");

CREATE TABLE "WorkerHeartbeat" (
    "role" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("role")
);

CREATE INDEX "WorkerHeartbeat_lastSeenAt_idx" ON "WorkerHeartbeat"("lastSeenAt");
