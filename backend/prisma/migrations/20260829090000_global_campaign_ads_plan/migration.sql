-- Nivel "campaña global" del centro de Ads: Campaign pasa a ser la estrategia
-- multicanal y estas tablas modelan su ejecución publicitaria: AdActivation
-- (presencia por plataforma), AdAudience (audiencias reutilizables),
-- CreativeBrief (puente hacia Creator Studio) y AdCreative (pieza producida
-- con su flujo de aprobación). Generada offline con prisma migrate diff.
-- CreateTable
CREATE TABLE "AdActivation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unconfigured',
    "objective" TEXT,
    "budgetCents" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "adAccountRef" TEXT,
    "conversionEvent" TEXT,
    "health" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAudience" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "location" TEXT,
    "ageRange" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customAudiences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedSize" INTEGER,
    "dataSource" TEXT,
    "consentBasis" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeBrief" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "activationId" TEXT,
    "audienceId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'meta',
    "format" TEXT,
    "message" JSONB,
    "cta" TEXT,
    "destination" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restrictions" TEXT,
    "variantCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "briefId" TEXT,
    "assetId" TEXT,
    "format" TEXT,
    "headline" TEXT,
    "primaryText" TEXT,
    "description" TEXT,
    "cta" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "metaAdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdActivation_orgId_platform_status_idx" ON "AdActivation"("orgId", "platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdActivation_campaignId_platform_key" ON "AdActivation"("campaignId", "platform");

-- CreateIndex
CREATE INDEX "AdAudience_orgId_archivedAt_idx" ON "AdAudience"("orgId", "archivedAt");

-- CreateIndex
CREATE INDEX "CreativeBrief_orgId_campaignId_status_idx" ON "CreativeBrief"("orgId", "campaignId", "status");

-- CreateIndex
CREATE INDEX "AdCreative_orgId_campaignId_approvalStatus_idx" ON "AdCreative"("orgId", "campaignId", "approvalStatus");

-- AddForeignKey
ALTER TABLE "AdActivation" ADD CONSTRAINT "AdActivation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdActivation" ADD CONSTRAINT "AdActivation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAudience" ADD CONSTRAINT "AdAudience_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAudience" ADD CONSTRAINT "AdAudience_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "AdActivation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "AdAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CreativeBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

