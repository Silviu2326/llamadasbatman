-- White-label agency clients, persisted workspace access and automatic training.
ALTER TABLE "KnowledgeBase"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "sourceUrl" TEXT;

CREATE TABLE "AgencyClient" (
  "id" TEXT NOT NULL,
  "agencyOrgId" TEXT NOT NULL,
  "clientOrgId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "clientEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
  "wholesaleCostCents" INTEGER NOT NULL DEFAULT 0,
  "monthlyVoiceMinutes" INTEGER NOT NULL DEFAULT 500,
  "monthlyMessages" INTEGER NOT NULL DEFAULT 1000,
  "activatedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgencyClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgencyClient_clientOrgId_key" ON "AgencyClient"("clientOrgId");
CREATE UNIQUE INDEX "AgencyClient_clientEmail_key" ON "AgencyClient"("clientEmail");
CREATE UNIQUE INDEX "AgencyClient_agencyOrgId_displayName_key" ON "AgencyClient"("agencyOrgId", "displayName");
CREATE INDEX "AgencyClient_agencyOrgId_status_idx" ON "AgencyClient"("agencyOrgId", "status");
ALTER TABLE "AgencyClient" ADD CONSTRAINT "AgencyClient_agencyOrgId_fkey" FOREIGN KEY ("agencyOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgencyClient" ADD CONSTRAINT "AgencyClient_clientOrgId_fkey" FOREIGN KEY ("clientOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhiteLabelConfig" (
  "id" TEXT NOT NULL,
  "clientOrgId" TEXT NOT NULL,
  "agencyOrgId" TEXT NOT NULL,
  "widgetKeyHash" TEXT NOT NULL,
  "brandName" TEXT NOT NULL,
  "logoUrl" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#4F46E5',
  "accentColor" TEXT NOT NULL DEFAULT '#22D3EE',
  "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
  "widgetTitle" TEXT NOT NULL DEFAULT '¿En qué podemos ayudarte?',
  "welcomeMessage" TEXT NOT NULL DEFAULT 'Hola, soy el asistente virtual. ¿En qué puedo ayudarte?',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhiteLabelConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhiteLabelConfig_clientOrgId_key" ON "WhiteLabelConfig"("clientOrgId");
CREATE UNIQUE INDEX "WhiteLabelConfig_widgetKeyHash_key" ON "WhiteLabelConfig"("widgetKeyHash");
CREATE INDEX "WhiteLabelConfig_agencyOrgId_idx" ON "WhiteLabelConfig"("agencyOrgId");
ALTER TABLE "WhiteLabelConfig" ADD CONSTRAINT "WhiteLabelConfig_clientOrgId_fkey" FOREIGN KEY ("clientOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhiteLabelTrainingJob" (
  "id" TEXT NOT NULL,
  "clientOrgId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
  "documentsCreated" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhiteLabelTrainingJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhiteLabelTrainingJob_clientOrgId_createdAt_idx" ON "WhiteLabelTrainingJob"("clientOrgId", "createdAt");
ALTER TABLE "WhiteLabelTrainingJob" ADD CONSTRAINT "WhiteLabelTrainingJob_clientOrgId_fkey" FOREIGN KEY ("clientOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhiteLabelUsage" (
  "id" TEXT NOT NULL,
  "clientOrgId" TEXT NOT NULL,
  "monthStart" TIMESTAMP(3) NOT NULL,
  "voiceMinutes" INTEGER NOT NULL DEFAULT 0,
  "messages" INTEGER NOT NULL DEFAULT 0,
  "trainingRuns" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhiteLabelUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhiteLabelUsage_clientOrgId_monthStart_key" ON "WhiteLabelUsage"("clientOrgId", "monthStart");
ALTER TABLE "WhiteLabelUsage" ADD CONSTRAINT "WhiteLabelUsage_clientOrgId_fkey" FOREIGN KEY ("clientOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
