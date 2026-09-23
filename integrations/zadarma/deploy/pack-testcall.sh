#!/bin/sh
# Empaqueta el despliegue de la ruta de llamadas de prueba.
#
# Se ejecuta en local, desde la raíz del repositorio, DESPUÉS de `npm run build`
# en `backend/`. Produce un tar.gz con solo los artefactos que cambian y con un
# manifiesto de sha256 que el instalador remoto vuelve a comprobar.
#
# No incluye ningún secreto: ni `.env`, ni tokens, ni el motor de consultas
# (binario específico de plataforma que ya está instalado en el VPS).
set -eu

repo=$(cd "$(dirname "$0")/../../.." && pwd)
backend="$repo/backend"
out=${1:-"$repo/integrations/zadarma/testcall-bundle.local.tar.gz"}
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

test -d "$backend/dist" || { echo "Falta backend/dist: ejecuta antes 'npm run build' en backend/" >&2; exit 1; }
test -d "$backend/node_modules/.prisma/client" || { echo "Falta el cliente Prisma generado: ejecuta 'npx prisma generate'" >&2; exit 1; }

# Ficheros compilados que cambian con la ruta de prueba. La pasarela y el worker
# son lo único que corre en el VPS: los controladores y rutas HTTP del CRM no se
# cargan allí, así que no viajan.
mkdir -p "$stage/dist/services" "$stage/dist/voice/telephony/zadarma" "$stage/prisma" "$stage/prisma-client"
for f in voiceTestCall.service.js voiceConsent.service.js internalVoiceTestRequest.service.js agents.service.js calls.service.js; do
  cp "$backend/dist/services/$f" "$stage/dist/services/$f"
done
cp "$backend/dist/voice/telephony/outbound.js" "$stage/dist/voice/telephony/outbound.js"
cp "$backend/dist/voice/compliance.js" "$stage/dist/voice/compliance.js"
for f in runtime.js gateway.js ami.js; do
  cp "$backend/dist/voice/telephony/zadarma/$f" "$stage/dist/voice/telephony/zadarma/$f"
done

# El esquema, para poder regenerar el cliente en el VPS.
cp "$backend/prisma/schema.prisma" "$stage/prisma/schema.prisma"

# Cliente Prisma ya generado, sin el motor: estos ficheros son JavaScript
# independiente de plataforma y llevan dentro el esquema nuevo. Sirven de
# alternativa si el VPS no tiene la CLI de Prisma para regenerarlo.
for f in index.js edge.js default.js wasm.js index-browser.js package.json schema.prisma default.d.ts edge.d.ts wasm.d.ts; do
  cp "$backend/node_modules/.prisma/client/$f" "$stage/prisma-client/$f"
done

version=$(cd "$backend" && node -p "require('./node_modules/@prisma/client/package.json').version")
cat > "$stage/BUNDLE.json" <<JSON
{
  "purpose": "vendrava-testcall-route",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "prismaClientVersion": "$version",
  "requiresModels": ["VoiceTestNumber"],
  "requiresColumns": ["Call.isTest"]
}
JSON

(cd "$stage" && find . -type f ! -name MANIFEST.sha256 | sort | xargs sha256sum > MANIFEST.sha256)
(cd "$stage" && tar -czf "$out" .)
echo "Paquete: $out"
sha256sum "$out"
echo "Cliente Prisma del paquete: $version"
