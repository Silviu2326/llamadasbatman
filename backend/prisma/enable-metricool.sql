-- Activa la integración social (Metricool) para la organización demo.
UPDATE "Organization" SET "metricoolEnabled" = true WHERE id = 'seed-org';
