-- Idempotencia raíz de Flows. PostgreSQL permite múltiples NULL, por lo que
-- los runs intencionales sin clave siguen siendo válidos.
ALTER TABLE "FlowRun" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "FlowRun_orgId_flowId_idempotencyKey_key"
ON "FlowRun"("orgId", "flowId", "idempotencyKey");
