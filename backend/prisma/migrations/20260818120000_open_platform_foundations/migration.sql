-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "microappId" TEXT,
    "flowRunId" TEXT,
    "parentJobId" TEXT,
    "provider" TEXT,
    "providerJobId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "costEstimateCents" DECIMAL(20,8),
    "costActualCents" DECIMAL(20,8),
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" JSONB,
    "leaseExpiresAt" TIMESTAMP(3),
    "workerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextPollAt" TIMESTAMP(3),
    "progress" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "checksum" TEXT,
    "jobId" TEXT,
    "parentAssetId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "prompt" TEXT,
    "params" JSONB,
    "costCents" DECIMAL(20,8),
    "currency" TEXT DEFAULT 'EUR',
    "campaignId" TEXT,
    "contentPieceId" TEXT,
    "brandScope" TEXT,
    "license" JSONB,
    "consentGrantId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "accessClass" TEXT NOT NULL DEFAULT 'private',
    "publishedStorageKey" TEXT,
    "publishedUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "label" TEXT,
    "params" JSONB,
    "costCents" DECIMAL(20,8),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRelation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "jobId" TEXT,
    "quantity" DECIMAL(20,8) NOT NULL,
    "unit" TEXT NOT NULL,
    "costCents" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "priceCents" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "rateVersion" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "billingMode" TEXT NOT NULL DEFAULT 'byok',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "softLimitCents" INTEGER,
    "hardLimitCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletHold" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WalletHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "usageRecordId" TEXT,
    "jobId" TEXT,
    "stripeRef" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_orgId_status_createdAt_idx" ON "Job"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_leaseExpiresAt_idx" ON "Job"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "Job_status_nextPollAt_idx" ON "Job"("status", "nextPollAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_orgId_kind_idempotencyKey_key" ON "Job"("orgId", "kind", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Job_provider_providerJobId_key" ON "Job"("provider", "providerJobId");

-- CreateIndex
CREATE INDEX "Asset_orgId_kind_status_createdAt_idx" ON "Asset"("orgId", "kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_orgId_campaignId_idx" ON "Asset"("orgId", "campaignId");

-- CreateIndex
CREATE INDEX "Asset_checksum_idx" ON "Asset"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_orgId_checksum_key" ON "Asset"("orgId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_id_orgId_key" ON "Asset"("id", "orgId");

-- CreateIndex
CREATE INDEX "AssetVersion_orgId_assetId_createdAt_idx" ON "AssetVersion"("orgId", "assetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_orgId_idempotencyKey_key" ON "AssetVersion"("orgId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssetRelation_parentId_childId_role_key" ON "AssetRelation"("parentId", "childId", "role");

-- CreateIndex
CREATE INDEX "AssetRelation_orgId_childId_idx" ON "AssetRelation"("orgId", "childId");

-- CreateIndex
CREATE INDEX "AssetRelation_orgId_parentId_idx" ON "AssetRelation"("orgId", "parentId");

-- CreateIndex
CREATE INDEX "UsageRecord_orgId_createdAt_idx" ON "UsageRecord"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_orgId_provider_capability_createdAt_idx" ON "UsageRecord"("orgId", "provider", "capability", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_jobId_idx" ON "UsageRecord"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_orgId_idempotencyKey_key" ON "UsageRecord"("orgId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_orgId_key" ON "Wallet"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_id_orgId_key" ON "Wallet"("id", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletHold_jobId_key" ON "WalletHold"("jobId");

-- CreateIndex
CREATE INDEX "WalletHold_walletId_status_expiresAt_idx" ON "WalletHold"("walletId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_orgId_idempotencyKey_key" ON "WalletTransaction"("orgId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_orgId_reason_createdAt_idx" ON "WalletTransaction"("orgId", "reason", "createdAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- Legacy lineage remains tenant-safe even if written outside the service.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentAssetId_orgId_fkey" FOREIGN KEY ("parentAssetId", "orgId") REFERENCES "Asset"("id", "orgId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRelation" ADD CONSTRAINT "AssetRelation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: include orgId so SQL directo cannot create cross-tenant lineage.
ALTER TABLE "AssetRelation" ADD CONSTRAINT "AssetRelation_parentId_orgId_fkey" FOREIGN KEY ("parentId", "orgId") REFERENCES "Asset"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRelation" ADD CONSTRAINT "AssetRelation_childId_orgId_fkey" FOREIGN KEY ("childId", "orgId") REFERENCES "Asset"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_walletId_orgId_fkey" FOREIGN KEY ("walletId", "orgId") REFERENCES "Wallet"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_orgId_fkey" FOREIGN KEY ("walletId", "orgId") REFERENCES "Wallet"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints: Prisma models status-like values as text, so Postgres
-- remains the final guard against impossible states and negative quantities.
ALTER TABLE "Job" ADD CONSTRAINT "Job_status_check" CHECK ("status" IN ('pending','running','waiting_provider','awaiting_approval','succeeded','failed','cancel_requested','canceled'));
ALTER TABLE "Job" ADD CONSTRAINT "Job_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" >= 1);
ALTER TABLE "Job" ADD CONSTRAINT "Job_progress_check" CHECK ("progress" IS NULL OR ("progress" >= 0 AND "progress" <= 100));
ALTER TABLE "Job" ADD CONSTRAINT "Job_costs_check" CHECK (("costEstimateCents" IS NULL OR "costEstimateCents" >= 0) AND ("costActualCents" IS NULL OR "costActualCents" >= 0));
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_bytes_check" CHECK ("bytes" >= 0);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_status_check" CHECK ("status" IN ('draft','approved','published','archived'));
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_accessClass_check" CHECK ("accessClass" IN ('private','shared','published'));
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_publication_check" CHECK (("accessClass" = 'published' AND "publishedStorageKey" IS NOT NULL AND "publishedUrl" IS NOT NULL AND "publishedAt" IS NOT NULL) OR ("accessClass" <> 'published'));
ALTER TABLE "AssetRelation" ADD CONSTRAINT "AssetRelation_no_self_check" CHECK ("parentId" <> "childId");
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_values_check" CHECK ("quantity" >= 0 AND "costCents" >= 0 AND "priceCents" >= 0);
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_billingMode_check" CHECK ("billingMode" IN ('managed','byok'));
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_amount_check" CHECK ("amountCents" >= 0);
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_status_check" CHECK ("status" IN ('active','captured','released','expired'));
