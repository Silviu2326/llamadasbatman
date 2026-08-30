# 02 — Fundamentos (Fase 0)

Cuatro piezas que bloquean casi todo lo demás. Ninguna es visible para el usuario final por sí sola, pero sin ellas la plataforma abierta acumula deuda desde el primer día. Todas son cambios de backend sobre patrones que ya existen en el repo.

Orden recomendado: **§2 (activos) → §3 (ledger) → §1 (jobs) → §4 (cifrado)**. §1 y §2 pueden ir en paralelo.

> **Anotación de revisión (18/08/2026).** Los modelos de este documento son diseños conceptuales, no migraciones listas para copiar. La implementación debe incorporar las correcciones de [11-REVISION-Y-ARRANQUE-HOY.md](11-REVISION-Y-ARRANQUE-HOY.md): precisión subcéntimo, idempotencia y reservas; jobs remotos que liberan lease mientras esperan; genealogía N:M de activos; y separación entre media privada y publicación pública estable.

---

## 1. Contrato universal de trabajo: modelo `Job`

Hoy cada dominio tiene su propia noción de trabajo asíncrono (`ImportJob`, `AutomationRun`, `WhiteLabelTrainingJob`, ejecuciones de orquestación). El Centro de trabajos (§8.4 de la visión) y el vídeo asíncrono necesitan una tabla común.

### Modelo Prisma

> **Mejora requerida:** añadir estados `submitted|waiting_provider|cancel_requested`, `idempotencyKey`, `nextPollAt`, timestamps de envío/cancelación y unicidad para `(provider, providerJobId)`. Un render remoto no debe mantener el lease mientras el proveedor trabaja.

```prisma
model Job {
  id            String    @id @default(cuid())
  orgId         String
  kind          String    // "image.generate", "video.generate", "research.company", "microapp.run", ...
  status        String    @default("queued") // queued|running|submitted|waiting_provider|awaiting_approval|succeeded|failed|cancel_requested|canceled
  priority      Int       @default(0)
  idempotencyKey String?

  // Quién y por qué
  createdById   String?
  microappId    String?   // receta que lo originó, si aplica
  flowRunId     String?   // ejecución de flujo padre, si aplica
  parentJobId   String?   // jobs encadenados

  // Proveedor y coste
  provider      String?   // resuelto por el router
  providerJobId String?   // id del trabajo asíncrono en el proveedor (Runway, Magnific...)
  currency      String    @default("EUR")
  costEstimate  Decimal?  @db.Decimal(20, 8)
  costActual    Decimal?  @db.Decimal(20, 8)

  // Entradas/salidas
  input         Json      // parámetros normalizados de la capability
  output        Json?     // referencias a Assets, datos estructurados
  error         Json?     // { code, message } ya redactado

  // Lease (mismo patrón que OutboxEvent)
  leaseExpiresAt DateTime?
  workerId       String?
  attempts       Int      @default(0)
  maxAttempts    Int      @default(3)
  nextPollAt     DateTime?
  progress       Int?

  createdAt     DateTime  @default(now())
  startedAt     DateTime?
  submittedAt   DateTime?
  cancelRequestedAt DateTime?
  canceledAt    DateTime?
  finishedAt    DateTime?

  org           Organization @relation(fields: [orgId], references: [id])
  assets        Asset[]

  @@index([orgId, status, createdAt])
  @@index([status, leaseExpiresAt])
  @@unique([orgId, kind, idempotencyKey])
  @@unique([provider, providerJobId])
  @@index([status, nextPollAt])
}
```

### Runtime

- Nuevo `backend/src/jobs/jobDispatcher.ts` basado en `outboxDispatcher.ts`: claim por `UPDATE` condicional, lease renovable y recuperación de huérfanos. Postgres actúa como fuente durable de verdad. Al enviar un render remoto, el job pasa a `waiting_provider` y libera el lease; ningún worker queda ocupado mientras el proveedor procesa.
- Los trabajos con `providerJobId` (asíncronos en el proveedor) se completan por **webhook entrante** (Magnific y Runway los ofrecen) con polling de respaldo cada N minutos.
- Reintentos: heredar la regla de `automations.service.ts` — un job cuyo efecto externo es incierto **no se reintenta automáticamente**, pasa a `failed` con `error.code = 'UNCERTAIN_EXTERNAL_OUTCOME'` y se ofrece reintento manual.
- Emitir progreso por el socket.io existente a la sala `org:<orgId>` (`backend/src/websockets/index.ts`), evento `job:update`.

### API

```
GET  /api/jobs?status=&kind=          → cola de la org (Centro de trabajos)
GET  /api/jobs/:id                    → detalle con coste y assets
POST /api/jobs/:id/cancel             → si el proveedor lo permite
POST /api/jobs/:id/retry              → solo si error es reintentable
```

Permisos: reutilizar el patrón `requirePermission` + `requireEntitlement`.

---

## 2. Biblioteca universal de activos: modelo `Asset`

**El punto más urgente del repo, con o sin plataforma abierta.** Estado actual (`backend/src/services/generatedMedia.service.ts`):

- Directorio plano `uploads/generated`, nombre `randomUUID().<ext>`, sin fila en BD, sin `orgId`.
- Servido por `GET /api/public/media/:file` **sin autenticación** (protección = UUID + regex).
- Comentario en el propio archivo: *"disco local — mover a S3/R2 si el backend escala a varias réplicas"*. Con 2 réplicas en Railway se pierde media.
- Los activos existentes viven dispersos: `ContentPiece.imageUrl/audioUrl`, `OrganicAsset.content`, `LeadFile.storageKey`, `Campaign.adAssets` (Json).

### 2.1 Storage primero

`backend/src/lib/s3.ts` ya existe (AWS SDK v3, endpoint configurable → R2) y lo usa `LeadFile`. Generalizar:

1. Todo asset nuevo se sube a S3/R2 con clave `org/<orgId>/assets/<assetId>/<filename>`.
2. La biblioteca privada se sirve mediante URL prefirmada con TTL corto y autorización. Publicar a landings, Meta o Metricool crea una copia/derivado inmutable con URL estable y `accessClass=published`; no se expone el original privado.
3. Migración: script idempotente con `--dry-run` que recorre `uploads/generated`, propone la organización desde sus consumidores, crea un manifiesto y sube a R2. Los casos ambiguos quedan `unresolved`; no se borra el original hasta comprobar lectura y vínculo.

### 2.2 Modelo Prisma

> **Mejora requerida:** `parentAssetId` es insuficiente para composiciones. Un vídeo puede derivar de imagen, audio, subtítulos, logo y varias tomas. La implementación debe utilizar una relación N:M tipada (`AssetRelation`). También debe distinguir acceso `private|shared|published`: las URLs prefirmadas cortas protegen la biblioteca privada, pero Meta/Metricool necesitan una publicación estable e inmutable.

```prisma
model Asset {
  id           String   @id @default(cuid())
  orgId        String
  kind         String   // image | video | audio | document | dataset | text
  mimeType     String
  storageKey   String   // clave S3/R2
  bytes        BigInt
  width        Int?
  height       Int?
  durationMs   Int?
  checksum     String?  // sha256, dedupe

  // Genealogía (§2.7 de la visión — el foso competitivo)
  jobId        String?  // generación que lo produjo
  provider     String?
  model        String?
  prompt       String?
  params       Json?
  costAmount   Decimal? @db.Decimal(20, 8)
  currency     String?  @default("EUR")

  // Pertenencia y derechos
  campaignId   String?
  contentPieceId String?
  brandScope   String?  // marca/cliente de agencia
  license      Json?    // { type, source, expiresAt }
  consentGrantId String? // si contiene rostro/voz de una persona (ver 08-SEGURIDAD)
  expiresAt    DateTime? // caducidad de oferta/dato temporal

  status       String   @default("draft") // draft | approved | published | archived
  accessClass  String   @default("private") // private | shared | published
  createdById  String?
  createdAt    DateTime @default(now())

  org          Organization @relation(fields: [orgId], references: [id])
  job          Job?         @relation(fields: [jobId], references: [id])
  versions     AssetVersion[]
  inputs       AssetRelation[] @relation("AssetRelationChild")
  outputs      AssetRelation[] @relation("AssetRelationParent")

  @@index([orgId, kind, status, createdAt])
  @@index([checksum])
}

model AssetVersion {
  id        String   @id @default(cuid())
  assetId   String
  storageKey String
  label     String?  // "original", "upscaled-magnific", "subtitled-es"
  params    Json?
  costAmount Decimal? @db.Decimal(20, 8)
  createdAt DateTime @default(now())
  asset     Asset    @relation(fields: [assetId], references: [id])
}

model AssetRelation {
  id        String   @id @default(cuid())
  orgId     String
  parentId  String
  childId   String
  role      String   // source|image|audio|subtitle|logo|reference|upscale_of|translation_of
  createdAt DateTime @default(now())

  parent Asset @relation("AssetRelationParent", fields: [parentId], references: [id], onDelete: Cascade)
  child  Asset @relation("AssetRelationChild", fields: [childId], references: [id], onDelete: Cascade)

  @@unique([parentId, childId, role])
  @@index([orgId, childId])
}
```

### 2.3 Migración de los consumidores actuales

Sin big-bang. Orden:

1. `assetGenerator.service.ts` y `contentVoiceover.service.ts` escriben `Asset` además del comportamiento actual (doble escritura).
2. `ContentPiece` gana `imageAssetId`/`audioAssetId` opcionales; el frontend prefiere el asset si existe.
3. `Campaign.adAssets` (Json) migra a relación `Asset[]` cuando se toque la fábrica de anuncios.
4. `generatedMedia.service.ts` queda como capa de compatibilidad de lectura y se retira al final.

---

## 3. Ledger de consumo y coste: `UsageRecord` + `Wallet`

Hoy no hay ninguna medición de coste por proveedor (lo único: la constante `VOICE_COST_PER_MINUTE` en `growthPredictor.service.ts` y `estimatedCostCents` manual en orquestación). Las cuotas de `access-control/consumption.ts` se derivan con `COUNT`/`SUM` de `Call` y `EmailDelivery`.

> **Mejora requerida:** no persistir cada uso únicamente en céntimos enteros. Las llamadas LLM pequeñas pueden costar menos de un céntimo y quedarían como cero. Medición, coste del proveedor y precio al cliente deben separarse; los importes necesitan `Decimal` o microeuros, moneda, versión de tarifa e `idempotencyKey`. Wallet, cuando llegue, necesita holds/reservas atómicas para trabajos concurrentes.

### 3.1 Modelo

```prisma
model UsageRecord {
  id          String   @id @default(cuid())
  orgId       String
  provider    String   // "deepseek", "twilio", "magnific", ...
  capability  String   // "llm.generate", "image.upscale", "call.minutes"
  jobId       String?
  quantity    Decimal  // tokens, segundos, imágenes...
  unit        String   // "tokens" | "seconds" | "images" | "chars"
  costAmount  Decimal  @db.Decimal(20, 8) // coste proveedor; 0 si BYOK
  priceAmount Decimal  @db.Decimal(20, 8) // precio cliente; 0 si BYOK
  currency    String   @default("EUR")
  tariffVersion String
  idempotencyKey String @unique
  billingMode String   // "managed" | "byok"
  meta        Json?    // modelo concreto, resolución...
  createdAt   DateTime @default(now())

  @@index([orgId, createdAt])
  @@index([orgId, provider, capability, createdAt])
}

model Wallet {
  id             String   @id @default(cuid())
  orgId          String   @unique
  balanceCents   Int      @default(0)   // créditos gestionados
  softLimitCents Int?                   // aviso
  hardLimitCents Int?                   // bloqueo
  updatedAt      DateTime @updatedAt
}

model WalletTransaction {
  id        String   @id @default(cuid())
  walletId  String
  amountCents Int    // + recarga, - consumo
  reason    String   // "topup" | "usage" | "refund" | "adjustment"
  usageRecordId String?
  stripeRef String?
  createdAt DateTime @default(now())
  @@index([walletId, createdAt])
}

model WalletHold {
  id          String   @id @default(cuid())
  walletId    String
  jobId       String   @unique
  amountCents Int
  status      String   @default("active") // active | captured | released | expired
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([walletId, status, expiresAt])
}
```

### 3.2 Reglas de implantación

- **Registrar siempre, cobrar después.** Desde el día 1, todo servicio que llame a un proveedor escribe `UsageRecord` con su mejor estimación de coste (tokens de la respuesta de DeepSeek, `durationSeconds` de Twilio, coste declarado por la API de Magnific). Esto da visibilidad de margen meses antes de vender créditos.
- Punto de inserción único: un helper `recordUsage()` en `backend/src/lib/usage.ts`, llamado desde los clientes de proveedor (no desde cada servicio de negocio).
- `consumption.ts` migra gradualmente: los dos recursos actuales (`call_minutes`, `emails_sent`) pasan a leer de `UsageRecord` con fallback al método actual, y se añaden nuevos recursos (`llm_tokens`, `images_generated`, `video_seconds`) sin tocar la interfaz `EntitlementError` existente.
- El descuento de `Wallet` ocurre en la finalización del `Job` (coste real), con **reserva previa** del estimado al crearlo para no sobregirar: `Wallet.balanceCents` nunca se comprueba de forma optimista para trabajos caros.
- Enforcement: el router (04-ROUTER) rechaza el job si `billingMode=managed` y `balance < estimate`, con error accionable ("recarga o conecta tu propia clave").

---

## 4. Unificación de cifrado de secretos

Hay 3 esquemas con 3 claves de entorno:

| Lib | Clave env | Usuarios |
|---|---|---|
| `lib/organizationCredentialsCrypto.ts` | `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` | OrganizationIntegrationCredential |
| `lib/tokenCrypto.ts` | `META_TOKEN_ENCRYPTION_KEY` | tokens Meta, secretos VerticalConnector |
| `lib/organicTokenCrypto.ts` | `ORGANIC_TOKEN_ENCRYPTION_KEY` | tokens Google orgánico |

### Plan

1. Elegir `organizationCredentialsCrypto.ts` como canónico (ya es AES-256-GCM con formato versionado `v1.`).
2. Añadir soporte multi-clave para rotación: `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS` como lista; la primera cifra, todas descifran. El prefijo de versión del formato ya lo permite (`v2.<keyId>.<iv>.<tag>.<ct>`).
3. Migración perezosa: al leer un secreto cifrado con el esquema viejo, descifrar con la lib vieja y recifrar con la canónica. Job de barrido final tras 30 días.
4. Las tablas `MetaAdAccount` y `OrganicIntegration` **no se fusionan** con `OrganizationIntegrationCredential` en esta fase (demasiado riesgo); solo comparten la lib de cifrado. La fusión de tablas es opcional en fase 1 (ver 03-PROVEEDORES §5).

**No hacer ahora:** KMS/vault por tenant. La clave global de deployment es aceptable para el tamaño actual; dejar el formato preparado (`keyId` en el prefijo) es suficiente.

---

## 5. Criterios de salida de la Fase 0

- [ ] Ningún asset nuevo se escribe en disco local; todos tienen fila `Asset` con `orgId`.
- [ ] La media privada ya no es accesible sin auth (URLs prefirmadas).
- [ ] `UsageRecord` registra el 100 % de llamadas a DeepSeek, OpenAI-imagen, Twilio, Resend y TTS con coste estimado.
- [ ] Dashboard interno de margen por org/proveedor (aunque sea una query SQL guardada).
- [ ] `Job` + `jobDispatcher` en producción con al menos un `kind` real (sugerido: mover la generación de imagen actual).
- [ ] Un solo módulo de cifrado en código nuevo; migración perezosa activa.
- [ ] Verificar y rotar cualquier credencial que haya vivido en el historial de Git. Actualmente `backend/.env` y `.env.bak-preusa` existen localmente e ignorados; el historial contiene commits asociados a esas rutas. No borrar la configuración local del usuario sin un procedimiento de sustitución.
