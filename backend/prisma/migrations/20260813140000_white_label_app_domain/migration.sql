-- Dominio propio del panel por marca. La fila de una agencia apunta a sí misma
-- (clientOrgId = agencyOrgId) y es la que marca su propio CRM.
ALTER TABLE "WhiteLabelConfig" ADD COLUMN "appDomain" TEXT;
CREATE UNIQUE INDEX "WhiteLabelConfig_appDomain_key" ON "WhiteLabelConfig"("appDomain");
