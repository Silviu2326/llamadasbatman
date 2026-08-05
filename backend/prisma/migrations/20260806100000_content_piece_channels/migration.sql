-- AlterTable
-- El canal de una pieza siempre fue una lista: el mismo post va a Instagram y a
-- LinkedIn, y Metricool crea un borrador por canal. Se pasa de columna singular
-- a lista **conservando lo que había** (hay piezas con `instagram` y con
-- `blog`): la columna se copia a un array de un elemento antes de eliminarla,
-- y las que estaban a NULL se quedan con la lista vacía.
ALTER TABLE "ContentPiece" ADD COLUMN "channels" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "ContentPiece" SET "channels" = ARRAY["channel"] WHERE "channel" IS NOT NULL;

ALTER TABLE "ContentPiece" DROP COLUMN "channel";
