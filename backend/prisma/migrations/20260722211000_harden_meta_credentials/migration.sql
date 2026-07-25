ALTER TABLE "MetaAdAccount" ADD COLUMN "metaUserId" TEXT;
ALTER TABLE "MetaAdAccount" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MetaAdAccount" ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "MetaAdAccount" ADD COLUMN "lastValidatedAt" TIMESTAMP(3);
ALTER TABLE "MetaAdAccount" ADD COLUMN "lastError" TEXT;
ALTER TABLE "MetaAdAccount" ALTER COLUMN "systemUserTokenEnc" DROP NOT NULL;
