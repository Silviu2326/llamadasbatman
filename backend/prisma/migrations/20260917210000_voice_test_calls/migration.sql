-- Llamadas de prueba para agentes en borrador.
-- Aditiva: una tabla nueva y una columna con valor por defecto. No reescribe
-- filas existentes ni cambia el comportamiento de las llamadas de campaña.

ALTER TABLE "Call" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Call_orgId_isTest_createdAt_idx" ON "Call"("orgId", "isTest", "createdAt");

CREATE TABLE "VoiceTestNumber" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "attestation" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "createdById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceTestNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceTestNumber_leadId_key" ON "VoiceTestNumber"("leadId");
CREATE UNIQUE INDEX "VoiceTestNumber_orgId_phone_key" ON "VoiceTestNumber"("orgId", "phone");
CREATE INDEX "VoiceTestNumber_orgId_revokedAt_idx" ON "VoiceTestNumber"("orgId", "revokedAt");

ALTER TABLE "VoiceTestNumber" ADD CONSTRAINT "VoiceTestNumber_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceTestNumber" ADD CONSTRAINT "VoiceTestNumber_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceTestNumber" ADD CONSTRAINT "VoiceTestNumber_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
