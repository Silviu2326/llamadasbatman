-- Sala pública Studio: token independiente y limitado a producción+master.
CREATE UNIQUE INDEX "Production_id_orgId_key" ON "Production"("id", "orgId");

CREATE TABLE "StudioReviewLink" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "productionId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT,
  "createdById" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioReviewLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioReviewComment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "timecodeMs" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "authorName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioReviewComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioReviewComment_timecodeMs_check" CHECK ("timecodeMs" >= 0),
  CONSTRAINT "StudioReviewComment_status_check" CHECK ("status" IN ('open', 'resolved', 'hidden'))
);

CREATE UNIQUE INDEX "StudioReviewLink_tokenHash_key" ON "StudioReviewLink"("tokenHash");
CREATE UNIQUE INDEX "StudioReviewLink_id_orgId_key" ON "StudioReviewLink"("id", "orgId");
CREATE INDEX "StudioReviewLink_orgId_productionId_createdAt_idx" ON "StudioReviewLink"("orgId", "productionId", "createdAt");
CREATE INDEX "StudioReviewLink_orgId_revokedAt_expiresAt_idx" ON "StudioReviewLink"("orgId", "revokedAt", "expiresAt");
CREATE INDEX "StudioReviewComment_orgId_linkId_timecodeMs_createdAt_idx" ON "StudioReviewComment"("orgId", "linkId", "timecodeMs", "createdAt");
CREATE INDEX "StudioReviewComment_orgId_status_createdAt_idx" ON "StudioReviewComment"("orgId", "status", "createdAt");

ALTER TABLE "StudioReviewLink" ADD CONSTRAINT "StudioReviewLink_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioReviewLink" ADD CONSTRAINT "StudioReviewLink_productionId_orgId_fkey"
  FOREIGN KEY ("productionId", "orgId") REFERENCES "Production"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioReviewLink" ADD CONSTRAINT "StudioReviewLink_assetId_orgId_fkey"
  FOREIGN KEY ("assetId", "orgId") REFERENCES "Asset"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioReviewComment" ADD CONSTRAINT "StudioReviewComment_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioReviewComment" ADD CONSTRAINT "StudioReviewComment_linkId_orgId_fkey"
  FOREIGN KEY ("linkId", "orgId") REFERENCES "StudioReviewLink"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
