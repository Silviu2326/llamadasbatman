ALTER TABLE "SeoReport" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "SeoReport_shareToken_key" ON "SeoReport"("shareToken");

ALTER TABLE "KnowledgeBase" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
