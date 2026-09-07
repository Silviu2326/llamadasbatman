-- Back office de plataforma: privilegio de operador, suplantación trazable y
-- un registro de auditoría que sobrevive al borrado de la organización.

ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AuthSession" ADD COLUMN "impersonatedByUserId" TEXT;

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_impersonatedByUserId_fkey"
  FOREIGN KEY ("impersonatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AuthSession_impersonatedByUserId_createdAt_idx" ON "AuthSession"("impersonatedByUserId", "createdAt");

CREATE TABLE "PlatformAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "orgId" TEXT,
  "targetUserId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "ip" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
CREATE INDEX "PlatformAuditLog_actorUserId_createdAt_idx" ON "PlatformAuditLog"("actorUserId", "createdAt");
CREATE INDEX "PlatformAuditLog_entityType_entityId_createdAt_idx" ON "PlatformAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "PlatformAuditLog_orgId_createdAt_idx" ON "PlatformAuditLog"("orgId", "createdAt");

-- ON DELETE SET NULL a propósito: borrar al operador no puede borrar la prueba
-- de lo que hizo. `actorEmail` se guarda desnormalizado por el mismo motivo.
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
