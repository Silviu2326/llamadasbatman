-- CreateTable
CREATE TABLE "AdActionResult" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "outcome" TEXT NOT NULL,
    "requestPayload" JSONB,
    "providerResponse" TEXT,
    "errorCode" TEXT,
    "httpStatus" INTEGER,
    "remoteStateAfter" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdActionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdActionResult_actionId_createdAt_idx" ON "AdActionResult"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "AdActionResult_orgId_createdAt_idx" ON "AdActionResult"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdActionResult" ADD CONSTRAINT "AdActionResult_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdActionResult" ADD CONSTRAINT "AdActionResult_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AdAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
