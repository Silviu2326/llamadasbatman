-- Enterprise RBAC roles. Existing admin/agent/viewer values remain valid.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'revenue_ops';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'sales_rep';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'marketing_growth';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'analyst';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'compliance';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'finance_controller';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'guest';

CREATE TYPE "AccessRequestType" AS ENUM (
  'role_elevation',
  'paid_experiment',
  'playbook_change'
);

CREATE TYPE "AccessRequestStatus" AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'consumed'
);

CREATE TABLE "AccessControlRequest" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "type" "AccessRequestType" NOT NULL,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'pending',
  "requesterUserId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "decidedByUserId" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "reason" TEXT,
  "payload" JSONB,
  "decisionComment" TEXT,
  "decidedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccessControlRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessControlRequest_orgId_status_createdAt_idx"
  ON "AccessControlRequest"("orgId", "status", "createdAt");
CREATE INDEX "AccessControlRequest_orgId_type_status_createdAt_idx"
  ON "AccessControlRequest"("orgId", "type", "status", "createdAt");
CREATE INDEX "AccessControlRequest_requesterUserId_status_createdAt_idx"
  ON "AccessControlRequest"("requesterUserId", "status", "createdAt");
CREATE INDEX "AccessControlRequest_decidedByUserId_decidedAt_idx"
  ON "AccessControlRequest"("decidedByUserId", "decidedAt");
CREATE INDEX "AccessControlRequest_targetUserId_type_status_idx"
  ON "AccessControlRequest"("targetUserId", "type", "status");
CREATE INDEX "AccessControlRequest_orgId_resourceType_resourceId_idx"
  ON "AccessControlRequest"("orgId", "resourceType", "resourceId");
CREATE UNIQUE INDEX "AccessControlRequest_one_pending_equivalent_idx"
  ON "AccessControlRequest"(
    "orgId",
    "type",
    "requesterUserId",
    COALESCE("targetUserId", ''),
    COALESCE("resourceType", ''),
    COALESCE("resourceId", '')
  )
  WHERE "status" = 'pending';

ALTER TABLE "AccessControlRequest"
  ADD CONSTRAINT "AccessControlRequest_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessControlRequest"
  ADD CONSTRAINT "AccessControlRequest_requesterUserId_fkey"
  FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessControlRequest"
  ADD CONSTRAINT "AccessControlRequest_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessControlRequest"
  ADD CONSTRAINT "AccessControlRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
