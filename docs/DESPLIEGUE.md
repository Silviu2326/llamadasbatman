# Despliegue

Actualizado: 12 de agosto de 2026. Guía para el primer despliegue real.

Arquitectura: **tres servicios**. Frontend estático en Vercel, API en Railway y
un **worker en un servicio aparte** con el mismo build pero distinto comando.
Sin ese tercer servicio la aplicación responde igual pero no ejecuta nada: ni
llamadas, ni automatizaciones, ni envíos. Es el fallo más caro de este montaje.

---

## 0. Antes de tocar Railway

En local, con el `.env` que vas a usar en producción:

```bash
cd backend
node ../scripts/ops-checks.mjs          # migraciones y ficheros de operación
npm run ops:production-gate -- --env-file .env
```

El gate **exige `NODE_ENV=production`** y falla si algo no cuadra. Dos trampas
conocidas:

- Si `REQUIRED_INTEGRATIONS` está vacío, el gate exige las **cinco**
  integraciones completas (Meta, Google, Metricool y Twilio). El correo se configura por organización con Resend en Vendrava. Declara
  solo las que vayas a tener mañana, por ejemplo `REQUIRED_INTEGRATIONS=twilio`.
- Los ocho secretos deben ser distintos entre sí y de 32 caracteres o más.
  Genera cada uno con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

---

## 1. Base de datos y Redis

1. Provisiona PostgreSQL y Redis gestionados en Railway.
2. Copia `DATABASE_URL` y `REDIS_URL`.
3. Aplica las migraciones **antes** del primer arranque, con backup hecho:

```bash
cd backend
DATABASE_URL="<la de producción>" npx prisma migrate deploy
```

El arranque **no** aplica migraciones. Si las saltas, la API arranca y falla en
cada consulta con columnas inexistentes.

---

## 2. Servicio API

Root directory `backend/`. Con el `Dockerfile` y el `railway.json` que ya están
en el repo, Railway construye y arranca solo. Comando: `node dist/index.js`.

Variables que **impiden arrancar** si faltan o son débiles:

| Variable | Por qué |
|---|---|
| `JWT_SECRET` | ≥32 caracteres, no puede ser un valor de la lista de inseguros |
| `OAUTH_STATE_SECRET` | ídem, y distinto del anterior |
| `CORS_ORIGINS` o `APP_URL` | solo en producción; sin esto lanza al construir la app |

Resto de variables imprescindibles para que funcione algo:

```dotenv
NODE_ENV=production
DATABASE_URL=...
REDIS_URL=...
PUBLIC_HOST=https://api.tudominio.com
APP_URL=https://app.tudominio.com
CORS_ORIGINS=https://app.tudominio.com
TWILIO_WEBHOOK_BASE_URL=https://api.tudominio.com
REQUIRED_INTEGRATIONS=twilio
META_TOKEN_ENCRYPTION_KEY=...
ORGANIC_TOKEN_ENCRYPTION_KEY=...
INTEGRATION_CREDENTIALS_ENCRYPTION_KEY=...
OBSERVABILITY_TOKEN=...
OBSERVABILITY_MUTATION_TOKEN=...
WORKER_HEARTBEAT_KEY=...
# Motor de voz (solo inglés)
CARTESIA_API_KEY=...
CARTESIA_VERSION=2026-03-01
CEREBRAS_API_KEY=...
CEREBRAS_MODEL=gpt-oss-120b
MINIMAX_API_KEY=...
MINIMAX_VOICE_ID=English_expressive_narrator
```

Comprobación: `GET /health` debe dar 200, y `GET /health/ready` **503 hasta que
levantes el worker**. Eso es correcto, no un fallo.

---

## 3. Servicio worker

Mismo repositorio, mismo root `backend/`, mismo Dockerfile. Solo cambian dos cosas:

- **Start command**: `node dist/worker.js`
- **Variables**: las mismas que la API, más `BACKGROUND_WORKERS_ENABLED=true` y
  `ORCHESTRATION_WORKER_ENABLED=true`.

Comprobación: en la API, `GET /health/ready` pasa a 200, y
`GET /health/workers` con `Authorization: Bearer $OBSERVABILITY_TOKEN` muestra
el heartbeat vivo. En el dashboard desaparece el aviso de tareas detenidas.

---

## 4. Frontend en Vercel

Root del repositorio, `npm run build`, salida `dist/`. El `vercel.json` ya
enruta la SPA. La URL del backend está fijada en el código
(`src/pages/voice-cabin/useVoiceSession.ts` y `src/lib/api.js`): si cambias de
dominio, cámbiala ahí.

---

## 5. Primer cliente

No hay registro público todavía (decisión pendiente, ver
[BLOQUEANTES.md §2](BLOQUEANTES.md)). El alta se hace por comando, desde el
contenedor de la API:

```bash
npm run org:create "Nombre del cliente" admin@cliente.com pro
```

Imprime una contraseña aleatoria **una sola vez**. El cliente puede cambiarla
desde "He olvidado mi contraseña", que ya funciona si `RESEND_API_KEY` y
`EMAIL_FROM` están configuradas.

Después, por cada organización: cargar sus credenciales de Twilio y Meta en
`/api/integration-credentials/*` y conectar Resend y Metricool desde Vendrava para las organizaciones que vayan a usar esos módulos.

---

## 6. Telefonía

1. Compra un número en Twilio.
2. Apunta su webhook de voz a `https://api.tudominio.com/api/voice/webhook/voice/inbound`
   con `orgId` y `agentId` en la query.
3. El agente que atienda ese número debe tener `callDirection` en `inbound` o
   `both`, y un tipo con sentido para entrante (Recepción, Soporte, Filtro).
   Un agente en `outbound` rechaza la llamada con un 400.
4. **El motor de voz solo habla inglés.** Un agente con otro idioma no llama:
   falla con `voice_language_unsupported`. Ver [ARQUITECTURA_VOZ.md](ARQUITECTURA_VOZ.md).

---

## 7. Qué mirar el primer día

- `GET /health/ready` en verde en API y worker.
- Una llamada de prueba desde `/voz/cabina` antes de gastar en telefonía: usa
  los mismos proveedores, sin Twilio de por medio.
- `GET /api/billing/usage`: consumo de minutos y envíos contra el techo del plan.
- `/plan`: con las primeras 20 llamadas empieza a proyectar con datos propios;
  antes de eso usa referencias del sector y lo dice.

---

## 8. Lo que sigue sin resolverse

- **Email marketing**: aplicar las migraciones nativas y conectar Resend por organización; sigue [EMAIL_MARKETING_ACTIVACION.md](EMAIL_MARKETING_ACTIVACION.md).
- **Sin registro self-service**: cada alta la haces tú por comando.
- **Sin calendario externo**: las reuniones son internas, con enlace pegado a mano.
- Nunca se ha ejecutado una llamada real contra los tres proveedores de voz a la
  vez. La primera llamada de mañana es la primera de verdad: hazla desde la
  cabina, no contra un cliente.



