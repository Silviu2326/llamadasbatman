-- CreateTable
CREATE TABLE "OrganicTrafficDaily" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "page" TEXT NOT NULL DEFAULT '',
    "sessions" INTEGER,
    "engagedSessions" INTEGER,
    "views" INTEGER,
    "calls" INTEGER,
    "websiteClicks" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganicTrafficDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganicTrafficDaily_orgId_date_idx" ON "OrganicTrafficDaily"("orgId", "date");

-- CreateIndex
CREATE INDEX "OrganicTrafficDaily_projectId_channel_date_idx" ON "OrganicTrafficDaily"("projectId", "channel", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OrganicTrafficDaily_projectId_provider_date_channel_page_key" ON "OrganicTrafficDaily"("projectId", "provider", "date", "channel", "page");

-- AddForeignKey
ALTER TABLE "OrganicTrafficDaily" ADD CONSTRAINT "OrganicTrafficDaily_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganicTrafficDaily" ADD CONSTRAINT "OrganicTrafficDaily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

