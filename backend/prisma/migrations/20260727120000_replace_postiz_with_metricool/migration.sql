-- Postiz se retira: Metricool es el único proveedor de redes sociales.
ALTER TABLE "Organization" RENAME COLUMN "postizEnabled" TO "metricoolEnabled";
ALTER TABLE "Organization" DROP COLUMN "postizWorkspaceId";
