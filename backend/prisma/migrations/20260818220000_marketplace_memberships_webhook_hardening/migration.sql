-- Fase 3 inicial: membresías N:M, marketplace declarativo y barreras fuertes.

ALTER TABLE "AuthSession" ADD COLUMN "activeOrgId" TEXT;
UPDATE "AuthSession" s SET "activeOrgId" = u."orgId" FROM "User" u WHERE u."id" = s."userId";

ALTER TABLE "WebhookEvent"
  ADD COLUMN "providerJobId" TEXT,
  ADD COLUMN "eventTimestamp" TIMESTAMP(3),
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "signatureValid" BOOLEAN,
  ADD COLUMN "signatureVersion" TEXT;
DROP INDEX IF EXISTS "WebhookEvent_externalEventId_key";
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");
CREATE INDEX "WebhookEvent_provider_providerJobId_idx" ON "WebhookEvent"("provider", "providerJobId");

ALTER TABLE "OutcomeEvent" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "OutcomeEvent" SET "idempotencyKey" = 'legacy:' || "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "OutcomeEvent" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "OutcomeEvent_orgId_idempotencyKey_key" ON "OutcomeEvent"("orgId", "idempotencyKey");

ALTER TABLE "Production"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "exportVersion" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "Production_orgId_archivedAt_updatedAt_idx" ON "Production"("orgId", "archivedAt", "updatedAt");

CREATE TABLE "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "invitedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);
INSERT INTO "OrganizationMembership" ("id", "orgId", "userId", "role", "status", "isDefault", "updatedAt")
SELECT 'legacy_' || "id", "orgId", "id", "role", 'active', true, CURRENT_TIMESTAMP FROM "User"
ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX "OrganizationMembership_orgId_userId_key" ON "OrganizationMembership"("orgId", "userId");
CREATE UNIQUE INDEX "OrganizationMembership_one_default_per_user" ON "OrganizationMembership"("userId") WHERE "isDefault" = true AND "status" = 'active';
CREATE INDEX "OrganizationMembership_userId_status_isDefault_idx" ON "OrganizationMembership"("userId", "status", "isDefault");
CREATE INDEX "OrganizationMembership_orgId_role_status_idx" ON "OrganizationMembership"("orgId", "role", "status");
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_status_check" CHECK ("status" IN ('active','invited','suspended'));

CREATE TABLE "MarketplaceListing" (
  "id" TEXT NOT NULL,
  "publisherOrgId" TEXT,
  "slug" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "latestVersionId" TEXT,
  "revenueShareBps" INTEGER NOT NULL DEFAULT 7000,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceListing_slug_key" ON "MarketplaceListing"("slug");
CREATE INDEX "MarketplaceListing_status_category_publishedAt_idx" ON "MarketplaceListing"("status", "category", "publishedAt");
CREATE INDEX "MarketplaceListing_publisherOrgId_status_updatedAt_idx" ON "MarketplaceListing"("publisherOrgId", "status", "updatedAt");
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_publisherOrgId_fkey" FOREIGN KEY ("publisherOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_kind_check" CHECK ("kind" IN ('microapp','flow'));
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_status_check" CHECK ("status" IN ('draft','in_review','approved','published','rejected','suspended'));
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_share_check" CHECK ("revenueShareBps" BETWEEN 0 AND 10000);

CREATE TABLE "MarketplaceVersion" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "signature" TEXT,
  "capabilityDependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceVersion_listingId_version_key" ON "MarketplaceVersion"("listingId", "version");
CREATE UNIQUE INDEX "MarketplaceVersion_listingId_checksum_key" ON "MarketplaceVersion"("listingId", "checksum");
ALTER TABLE "MarketplaceVersion" ADD CONSTRAINT "MarketplaceVersion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceVersion" ADD CONSTRAINT "MarketplaceVersion_price_check" CHECK ("priceCents" >= 0);

CREATE TABLE "MarketplaceInstall" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'installed',
  "installedById" TEXT NOT NULL,
  "config" JSONB,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceInstall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceInstall_orgId_listingId_key" ON "MarketplaceInstall"("orgId", "listingId");
CREATE INDEX "MarketplaceInstall_orgId_status_updatedAt_idx" ON "MarketplaceInstall"("orgId", "status", "updatedAt");
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_status_check" CHECK ("status" IN ('installed','disabled','uninstalled'));

CREATE TABLE "MarketplaceEntitlement" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'install',
  "grantedById" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceEntitlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceEntitlement_orgId_listingId_key" ON "MarketplaceEntitlement"("orgId", "listingId");
CREATE INDEX "MarketplaceEntitlement_orgId_status_expiresAt_idx" ON "MarketplaceEntitlement"("orgId", "status", "expiresAt");
ALTER TABLE "MarketplaceEntitlement" ADD CONSTRAINT "MarketplaceEntitlement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceEntitlement" ADD CONSTRAINT "MarketplaceEntitlement_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceEntitlement" ADD CONSTRAINT "MarketplaceEntitlement_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceEntitlement" ADD CONSTRAINT "MarketplaceEntitlement_status_check" CHECK ("status" IN ('active','suspended','expired','revoked'));

CREATE TABLE "MarketplaceLedgerEntry" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "counterpartyOrgId" TEXT,
  "listingId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "microappRunId" TEXT,
  "kind" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "settlementKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceLedgerEntry_orgId_idempotencyKey_key" ON "MarketplaceLedgerEntry"("orgId", "idempotencyKey");
CREATE INDEX "MarketplaceLedgerEntry_settlementKey_createdAt_idx" ON "MarketplaceLedgerEntry"("settlementKey", "createdAt");
CREATE INDEX "MarketplaceLedgerEntry_listingId_kind_createdAt_idx" ON "MarketplaceLedgerEntry"("listingId", "kind", "createdAt");
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_counterpartyOrgId_fkey" FOREIGN KEY ("counterpartyOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_microappRunId_fkey" FOREIGN KEY ("microappRunId") REFERENCES "MicroappRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_kind_check" CHECK ("kind" IN ('customer_charge','publisher_share','platform_fee','refund'));
