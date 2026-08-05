-- CreateTable
CREATE TABLE "ContentOpportunity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "objective" TEXT,
    "evidenceCount" INTEGER NOT NULL,
    "conversationsScanned" INTEGER NOT NULL DEFAULT 0,
    "evidenceSummary" TEXT,
    "sourceRefs" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "weekOf" TIMESTAMP(3) NOT NULL,
    "dismissedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentOpportunity_orgId_weekOf_status_idx" ON "ContentOpportunity"("orgId", "weekOf", "status");

-- CreateIndex
CREATE INDEX "ContentOpportunity_orgId_status_createdAt_idx" ON "ContentOpportunity"("orgId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ContentOpportunity" ADD CONSTRAINT "ContentOpportunity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

