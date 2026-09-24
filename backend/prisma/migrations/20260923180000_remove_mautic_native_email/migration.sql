-- Migrate Vendrava to its native email workspace with Resend as the only sender.
-- Locally stored recipient consent and delivery/event history are retained.

ALTER TABLE "MarketingCampaign" ADD COLUMN "emailDraftId" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "contentSnapshot" JSONB;
ALTER TABLE "EmailDelivery" ADD COLUMN "emailDraftId" TEXT;
ALTER TABLE "EmailDelivery" ADD COLUMN "subjectSnapshot" TEXT;
ALTER TABLE "EmailDelivery" ADD COLUMN "htmlSnapshot" TEXT;

-- Carry a Mautic template binding into a local newsletter draft only when the
-- same organization already has that template represented locally.
UPDATE "MarketingCampaign" AS campaign
SET "emailDraftId" = draft."id",
    "contentSnapshot" = draft."content"
FROM "MauticAssetBinding" AS binding
JOIN "EmailNewsletterDraft" AS draft
  ON draft."orgId" = binding."orgId"
 AND draft."mauticTemplateId" = binding."externalId"
WHERE campaign."templateBindingId" = binding."id"
  AND campaign."orgId" = binding."orgId"
  AND binding."assetType" = 'template'::"MauticAssetType";

UPDATE "EmailDelivery" AS delivery
SET "emailDraftId" = draft."id",
    "subjectSnapshot" = COALESCE(draft."content"->>'subject', draft."name")
FROM "EmailNewsletterDraft" AS draft
WHERE delivery."orgId" = draft."orgId"
  AND delivery."templateExternalId" = draft."mauticTemplateId";

-- Prevent a legacy queue item from being picked up and sent after the provider
-- cutover. Keep the rows as a local operational history.
UPDATE "EmailDelivery"
SET "status" = 'failed',
    "failedAt" = COALESCE("failedAt", CURRENT_TIMESTAMP),
    "failureCode" = 'LEGACY_EMAIL_PROVIDER_REMOVED',
    "failureDetail" = 'Revisa el contenido y vuelve a programar el envío en Vendrava.'
WHERE "status" IN ('queued', 'processing')
  AND ("campaignId" IN (SELECT "id" FROM "MarketingCampaign" WHERE "provider" = 'mautic')
       OR "providerMessageId" IS NULL);

UPDATE "Message"
SET "status" = 'failed',
    "failedAt" = COALESCE("failedAt", CURRENT_TIMESTAMP)
WHERE "provider" = 'mautic'
  AND "direction" = 'outbound'
  AND "status" IN ('queued', 'processing');
UPDATE "Message" SET "provider" = 'legacy_email' WHERE "provider" = 'mautic';
UPDATE "DeliveryAttempt" SET "provider" = 'legacy_email' WHERE "provider" = 'mautic';

-- Campaign definitions and analytics that only existed as a Mautic mirror are
-- removed. Recipient delivery records and normalized email events stay local.
UPDATE "EmailDelivery"
SET "campaignId" = NULL
WHERE "campaignId" IN (SELECT "id" FROM "MarketingCampaign" WHERE "provider" = 'mautic');
DELETE FROM "MarketingCampaign" WHERE "provider" = 'mautic';

-- Keep locally recorded events, but no longer label them as a live Mautic feed.
UPDATE "EmailEvent" SET "provider" = 'legacy_email' WHERE "provider" = 'mautic';
DELETE FROM "WebhookEvent" WHERE "provider" = 'mautic';
DELETE FROM "OrganizationIntegrationCredential" WHERE "provider" = 'mautic';
UPDATE "Lead"
SET "customFields" = "customFields" - 'mauticActivity'
WHERE "customFields" IS NOT NULL AND "customFields" ? 'mauticActivity';

-- Convert the locally modeled campaign and delivery schema to native drafts.
ALTER TABLE "MarketingCampaign" ALTER COLUMN "provider" SET DEFAULT 'resend';
ALTER TABLE "MarketingCampaign" DROP COLUMN "externalCampaignId";
ALTER TABLE "MarketingCampaign" DROP COLUMN "templateBindingId";
ALTER TABLE "MarketingCampaign" ALTER COLUMN "variantDefinition" DROP DEFAULT;
UPDATE "MarketingCampaign" SET "variantDefinition" = NULL WHERE "variantDefinition" IS NOT NULL;

ALTER TABLE "EmailDelivery" DROP COLUMN "templateExternalId";

-- Templates and A/B variants are now local draft IDs; bind the campaign and
-- delivery history to those drafts only where the local match above succeeded.
ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_emailDraftId_fkey"
  FOREIGN KEY ("emailDraftId") REFERENCES "EmailNewsletterDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailDelivery"
  ADD CONSTRAINT "EmailDelivery_emailDraftId_fkey"
  FOREIGN KEY ("emailDraftId") REFERENCES "EmailNewsletterDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MarketingCampaign_emailDraftId_idx" ON "MarketingCampaign"("emailDraftId");
CREATE INDEX "EmailDelivery_emailDraftId_idx" ON "EmailDelivery"("emailDraftId");

ALTER TABLE "EmailEvent" ALTER COLUMN "provider" SET DEFAULT 'resend';
ALTER TABLE "Organization" DROP COLUMN "mauticEnabled";
ALTER TABLE "Organization" DROP COLUMN "mauticCompanyId";
ALTER TABLE "EmailNewsletterDraft" DROP COLUMN "mauticTemplateId";
DROP TABLE "MauticContactBinding";
DROP TABLE "MauticAssetBinding";
DROP TYPE "MauticAssetType";
