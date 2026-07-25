CREATE TABLE "SensitiveApprovalRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requesterUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "decisionComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensitiveApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SensitiveApprovalRequest_orgId_status_createdAt_idx"
    ON "SensitiveApprovalRequest"("orgId", "status", "createdAt");
CREATE INDEX "SensitiveApprovalRequest_orgId_action_resourceType_resourceId_status_idx"
    ON "SensitiveApprovalRequest"("orgId", "action", "resourceType", "resourceId", "status");
CREATE INDEX "SensitiveApprovalRequest_requesterUserId_status_createdAt_idx"
    ON "SensitiveApprovalRequest"("requesterUserId", "status", "createdAt");
CREATE INDEX "SensitiveApprovalRequest_decidedByUserId_decidedAt_idx"
    ON "SensitiveApprovalRequest"("decidedByUserId", "decidedAt");

ALTER TABLE "SensitiveApprovalRequest"
    ADD CONSTRAINT "SensitiveApprovalRequest_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SensitiveApprovalRequest"
    ADD CONSTRAINT "SensitiveApprovalRequest_requesterUserId_fkey"
    FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SensitiveApprovalRequest"
    ADD CONSTRAINT "SensitiveApprovalRequest_decidedByUserId_fkey"
    FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
