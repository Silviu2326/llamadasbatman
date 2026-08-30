-- Conserva el contrato de lectura vigente cuando se ejecutó cada microapp.
-- Los NULL identifican filas legacy y permiten una migración compatible.
ALTER TABLE "MicroappRun"
  ADD COLUMN "dataAccessSnapshot" JSONB,
  ADD COLUMN "accessRolesSnapshot" JSONB;

-- Acelera el `array_contains` usado para paginar historial autorizado sin
-- cargar toda la organización en memoria.
CREATE INDEX "MicroappRun_accessRolesSnapshot_idx"
ON "MicroappRun" USING GIN ("accessRolesSnapshot");
