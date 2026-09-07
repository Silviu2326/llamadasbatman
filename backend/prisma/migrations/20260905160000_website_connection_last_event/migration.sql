-- Verificación real del script universal: la conexión guarda la última señal recibida.
ALTER TABLE "WebsiteConnection" ADD COLUMN "lastEventAt" TIMESTAMP(3);
