-- Los clientes existentes conservan sus cuotas anteriores. Las nuevas altas
-- usan la versión comercial 2026-09, con minutos y envíos publicados.
ALTER TABLE "Organization" ADD COLUMN "commercialTermsVersion" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Organization" ADD COLUMN "stripeSubscriptionId" TEXT;
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");
