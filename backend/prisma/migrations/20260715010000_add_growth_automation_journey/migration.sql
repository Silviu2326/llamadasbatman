-- La automatización existente sigue siendo el ejecutor. Este tipo permite
-- guardar su programa de negocio (objetivo, audiencia y vínculo en config)
-- junto con el resto del Growth Hub.
ALTER TYPE "GrowthProgramType" ADD VALUE IF NOT EXISTS 'automation_journey';
