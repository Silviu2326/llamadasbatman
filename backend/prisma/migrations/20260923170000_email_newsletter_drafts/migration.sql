CREATE TABLE "EmailNewsletterDraft" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Newsletter sin título',
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailNewsletterDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailNewsletterDraft_orgId_updatedAt_idx" ON "EmailNewsletterDraft"("orgId", "updatedAt");
ALTER TABLE "EmailNewsletterDraft" ADD CONSTRAINT "EmailNewsletterDraft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailNewsletterDraft" ADD COLUMN "mauticTemplateId" TEXT;
