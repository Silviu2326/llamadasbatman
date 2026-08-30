-- EM-113: prueba A/B de asunto en campañas de email.
-- La variante es una plantilla distinta de Mautic (el asunto vive en la
-- plantilla), y cada envío guarda cuál le tocó para poder comparar después.
ALTER TABLE "MarketingCampaign" ADD COLUMN     "variantDefinition" JSONB;
ALTER TABLE "EmailDelivery" ADD COLUMN     "variantKey" TEXT;

CREATE INDEX "EmailDelivery_orgId_campaignId_variantKey_idx" ON "EmailDelivery"("orgId", "campaignId", "variantKey");
