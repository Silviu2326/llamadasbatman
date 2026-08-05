-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "reviewReport" JSONB;

-- CreateTable
CREATE TABLE "ContentPieceEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPieceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentApprovalLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentApprovalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPieceEvent_orgId_pieceId_createdAt_idx" ON "ContentPieceEvent"("orgId", "pieceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentApprovalLink_tokenHash_key" ON "ContentApprovalLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ContentApprovalLink_orgId_revokedAt_idx" ON "ContentApprovalLink"("orgId", "revokedAt");

-- AddForeignKey
ALTER TABLE "ContentPieceEvent" ADD CONSTRAINT "ContentPieceEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPieceEvent" ADD CONSTRAINT "ContentPieceEvent_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentApprovalLink" ADD CONSTRAINT "ContentApprovalLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
