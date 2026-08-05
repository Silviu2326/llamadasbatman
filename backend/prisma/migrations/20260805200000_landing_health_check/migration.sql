-- CreateTable
CREATE TABLE "LandingHealthCheck" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "ttfbMs" INTEGER,
    "totalMs" INTEGER,
    "documentBytes" INTEGER,
    "heroImageBytes" INTEGER,
    "mobileReady" BOOLEAN,
    "verdict" TEXT NOT NULL DEFAULT 'unknown',
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingHealthCheck_orgId_landingKey_checkedAt_idx" ON "LandingHealthCheck"("orgId", "landingKey", "checkedAt");

-- AddForeignKey
ALTER TABLE "LandingHealthCheck" ADD CONSTRAINT "LandingHealthCheck_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingHealthCheck" ADD CONSTRAINT "LandingHealthCheck_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

