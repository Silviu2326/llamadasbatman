CREATE TABLE "SeoReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoReport_orgId_url_createdAt_idx"
    ON "SeoReport"("orgId", "url", "createdAt");

ALTER TABLE "SeoReport"
    ADD CONSTRAINT "SeoReport_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
