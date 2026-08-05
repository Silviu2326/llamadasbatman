-- AlterTable
ALTER TABLE "OrganicProject" ADD COLUMN     "audience" TEXT,
ADD COLUMN     "businessDescription" TEXT,
ADD COLUMN     "businessModel" TEXT,
ADD COLUMN     "moduleAnswers" JSONB,
ADD COLUMN     "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started',
ADD COLUMN     "onboardingStep" TEXT,
ADD COLUMN     "personalizationLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "primaryGoal" TEXT,
ADD COLUMN     "sectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "socialProfiles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "OrganicContentRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "formats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalPolicy" TEXT NOT NULL DEFAULT 'approval',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganicContentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "campaignId" TEXT,
    "format" TEXT NOT NULL,
    "channel" TEXT,
    "objective" TEXT,
    "body" JSONB NOT NULL,
    "evidenceSummary" TEXT,
    "voiceVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rejectionReason" TEXT,
    "editedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "minutesSaved" INTEGER,
    "utmContent" TEXT,
    "externalDraftId" TEXT,
    "imageUrl" TEXT,
    "createdById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganicContentRule_orgId_isActive_idx" ON "OrganicContentRule"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OrganicContentRule_projectId_moduleKey_eventKey_key" ON "OrganicContentRule"("projectId", "moduleKey", "eventKey");

-- CreateIndex
CREATE INDEX "ContentPiece_orgId_status_createdAt_idx" ON "ContentPiece"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentPiece_orgId_opportunityId_idx" ON "ContentPiece"("orgId", "opportunityId");

-- CreateIndex
CREATE INDEX "ContentPiece_orgId_utmContent_idx" ON "ContentPiece"("orgId", "utmContent");

-- AddForeignKey
ALTER TABLE "OrganicContentRule" ADD CONSTRAINT "OrganicContentRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganicContentRule" ADD CONSTRAINT "OrganicContentRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OrganicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ContentOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

