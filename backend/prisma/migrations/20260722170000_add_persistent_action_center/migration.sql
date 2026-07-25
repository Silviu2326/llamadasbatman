-- Centro de acción persistente: elimina el estado efímero por proceso y
-- conserva transiciones auditables e idempotentes por organización.
CREATE TYPE "ActionItemStatus" AS ENUM ('new', 'accepted', 'in_progress', 'completed', 'dismissed', 'blocked');
CREATE TYPE "ActionItemPriority" AS ENUM ('urgent', 'high', 'medium', 'low');

CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "priority" "ActionItemPriority" NOT NULL DEFAULT 'medium',
    "impactMetric" TEXT,
    "impactValue" DOUBLE PRECISION,
    "impactLabel" TEXT,
    "ownerType" TEXT NOT NULL DEFAULT 'team',
    "ownerId" TEXT,
    "ownerLabel" TEXT NOT NULL,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'new',
    "ctaLabel" TEXT NOT NULL,
    "ctaMethod" TEXT NOT NULL DEFAULT 'navigate',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetPath" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "result" JSONB,
    "resultLabel" TEXT,
    "lastResultAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionItemHistory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actionItemId" TEXT NOT NULL,
    "fromStatus" "ActionItemStatus",
    "toStatus" "ActionItemStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionItemHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionItem_orgId_dedupeKey_key"
    ON "ActionItem"("orgId", "dedupeKey");
CREATE INDEX "ActionItem_orgId_status_priority_updatedAt_idx"
    ON "ActionItem"("orgId", "status", "priority", "updatedAt");
CREATE INDEX "ActionItem_orgId_dueAt_idx"
    ON "ActionItem"("orgId", "dueAt");
CREATE INDEX "ActionItem_orgId_ownerId_status_idx"
    ON "ActionItem"("orgId", "ownerId", "status");

CREATE UNIQUE INDEX "ActionItemHistory_orgId_idempotencyKey_key"
    ON "ActionItemHistory"("orgId", "idempotencyKey");
CREATE INDEX "ActionItemHistory_orgId_actionItemId_createdAt_idx"
    ON "ActionItemHistory"("orgId", "actionItemId", "createdAt");
CREATE INDEX "ActionItemHistory_orgId_createdAt_idx"
    ON "ActionItemHistory"("orgId", "createdAt");
CREATE INDEX "ActionItemHistory_actorUserId_createdAt_idx"
    ON "ActionItemHistory"("actorUserId", "createdAt");

ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionItemHistory" ADD CONSTRAINT "ActionItemHistory_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionItemHistory" ADD CONSTRAINT "ActionItemHistory_actionItemId_fkey"
    FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionItemHistory" ADD CONSTRAINT "ActionItemHistory_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
