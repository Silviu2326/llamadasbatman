-- Organic Google OAuth fase 2.
-- Los tokens y verifiers se almacenan cifrados por la aplicación; nunca se
-- persisten secretos en claro ni se devuelven en endpoints de estado.
ALTER TABLE "OrganicIntegration"
  ADD COLUMN "accessTokenEnc" TEXT,
  ADD COLUMN "refreshTokenEnc" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "discovery" JSONB,
  ADD COLUMN "lastDiscoveredAt" TIMESTAMP(3);

CREATE TABLE "OrganicOAuthState" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "provider" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifierEnc" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganicOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganicOAuthState_stateHash_key"
  ON "OrganicOAuthState"("stateHash");
CREATE INDEX "OrganicOAuthState_orgId_provider_expiresAt_idx"
  ON "OrganicOAuthState"("orgId", "provider", "expiresAt");
CREATE INDEX "OrganicOAuthState_projectId_provider_expiresAt_idx"
  ON "OrganicOAuthState"("projectId", "provider", "expiresAt");

ALTER TABLE "OrganicOAuthState" ADD CONSTRAINT "OrganicOAuthState_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
