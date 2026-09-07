-- Conector Git: cambios propuestos sobre la web del cliente como pull request.
CREATE TABLE "WebsiteChangeProposal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "jobId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "branch" TEXT,
    "prNumber" INTEGER,
    "prUrl" TEXT,
    "headSha" TEXT,
    "summary" TEXT,
    "files" JSONB,
    "checksStatus" TEXT,
    "error" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "proposedAt" TIMESTAMP(3),
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "WebsiteChangeProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteChangeProposal_orgId_connectionId_createdAt_idx" ON "WebsiteChangeProposal"("orgId", "connectionId", "createdAt");
CREATE INDEX "WebsiteChangeProposal_status_updatedAt_idx" ON "WebsiteChangeProposal"("status", "updatedAt");

ALTER TABLE "WebsiteChangeProposal" ADD CONSTRAINT "WebsiteChangeProposal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebsiteChangeProposal" ADD CONSTRAINT "WebsiteChangeProposal_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WebsiteConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
