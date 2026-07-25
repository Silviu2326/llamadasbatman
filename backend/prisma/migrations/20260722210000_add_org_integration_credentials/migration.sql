-- CreateTable
CREATE TABLE "OrganizationIntegrationCredential" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "slot" TEXT NOT NULL DEFAULT 'default',
    "secretEnc" TEXT,
    "metadata" JSONB,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'connected',
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationIntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationIntegrationCredential_orgId_provider_slot_key" ON "OrganizationIntegrationCredential"("orgId", "provider", "slot");
CREATE INDEX "OrganizationIntegrationCredential_orgId_provider_status_idx" ON "OrganizationIntegrationCredential"("orgId", "provider", "status");
CREATE INDEX "OrganizationIntegrationCredential_provider_status_updatedAt_idx" ON "OrganizationIntegrationCredential"("provider", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "OrganizationIntegrationCredential" ADD CONSTRAINT "OrganizationIntegrationCredential_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
