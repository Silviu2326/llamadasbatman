ALTER TABLE "KnowledgeBase" ADD COLUMN "slug" TEXT;
ALTER TABLE "KnowledgeBase" ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE TABLE "SeoProject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "business" TEXT,
    "sector" TEXT,
    "city" TEXT,
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoProject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoProject_orgId_url_key" ON "SeoProject"("orgId", "url");

ALTER TABLE "SeoProject"
    ADD CONSTRAINT "SeoProject_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SeoKeywordRank" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "position" DOUBLE PRECISION,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoKeywordRank_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoKeywordRank_orgId_url_keyword_capturedAt_idx"
    ON "SeoKeywordRank"("orgId", "url", "keyword", "capturedAt");

ALTER TABLE "SeoKeywordRank"
    ADD CONSTRAINT "SeoKeywordRank_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
