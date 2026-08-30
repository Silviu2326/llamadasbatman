# Imagen del backend. Sirve para los DOS servicios: la API y el worker.
# Lo único que cambia entre ellos es el comando de arranque, porque comparten
# el mismo build (`dist/index.js` y `dist/worker.js`).
#
# Hasta ahora no había Dockerfile en el repo: el despliegue dependía de la
# configuración de Railway, que no estaba versionada y no se podía reproducir.

FROM node:22-slim AS build
WORKDIR /app

# openssl lo necesita el motor de consultas de Prisma en la imagen slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Las dependencias se instalan antes de copiar el código para que un cambio en
# una línea de TypeScript no invalide la caché de npm.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Fuera las dependencias de desarrollo, pero conservando el cliente de Prisma
# que se acaba de generar dentro de node_modules.
RUN npm prune --omit=dev


FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
# Los scripts operativos (alta de organización, guardas) viajan con la imagen:
# hacen falta desde dentro del contenedor en producción.
COPY scripts ./scripts

# No arrancar como root. Las migraciones se aplican desde fuera, no al arrancar.
USER node

EXPOSE 3000

# El liveness responde sin tocar la base: distingue "proceso vivo" de "listo".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# API por defecto. El servicio worker sobreescribe el comando:
#   CMD ["node", "dist/worker.js"]
CMD ["node", "dist/index.js"]
