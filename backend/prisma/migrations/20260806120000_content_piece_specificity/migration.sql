-- AlterTable
-- Chequeo de especificidad (idea 27): el informe se guarda con la pieza y no
-- aparte porque es parte de lo que hay que enseñar al aprobarla —qué frases
-- genéricas se sustituyeron con datos de la base de conocimiento y cuáles
-- siguen marcadas por falta de dato.
ALTER TABLE "ContentPiece" ADD COLUMN     "specificity" JSONB;
