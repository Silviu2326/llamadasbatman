-- Centro universal de conexiones web: detección, capacidades y modo de instalación.
CREATE TABLE "WebsiteConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "technology" TEXT NOT NULL DEFAULT 'unknown',
    "technologyLabel" TEXT NOT NULL DEFAULT 'Tecnología no identificada',
    "status" TEXT NOT NULL DEFAULT 'setup_required',
    "connectionMode" TEXT NOT NULL DEFAULT 'script',
    "recommendedMode" TEXT NOT NULL DEFAULT 'script',
    "siteKey" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "detection" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsiteConnection_siteKey_key" ON "WebsiteConnection"("siteKey");
CREATE UNIQUE INDEX "WebsiteConnection_orgId_domain_key" ON "WebsiteConnection"("orgId", "domain");
CREATE INDEX "WebsiteConnection_orgId_status_idx" ON "WebsiteConnection"("orgId", "status");

ALTER TABLE "WebsiteConnection"
  ADD CONSTRAINT "WebsiteConnection_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
