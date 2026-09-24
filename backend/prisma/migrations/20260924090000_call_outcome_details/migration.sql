-- Resultado real de la llamada en el CRM.
-- Aditiva: dos columnas opcionales en "Call". No reescribe filas existentes.
--   meetingAt        fecha acordada para la reunión (clasificador o PATCH manual)
--   transcriptTurns  transcripción por turnos [{ role, text, atMs }]

ALTER TABLE "Call" ADD COLUMN "meetingAt" TIMESTAMP(3);
ALTER TABLE "Call" ADD COLUMN "transcriptTurns" JSONB;
