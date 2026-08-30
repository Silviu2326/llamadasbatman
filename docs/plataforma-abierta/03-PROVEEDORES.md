# 03 — Registro de proveedores, conectores y BYOK (Fase 1)

Objetivo: pasar de integraciones cableadas a un **catálogo de capacidades** (§2.2 y §2.4 de la visión) sin reescribir los servicios que hoy funcionan.

Principio rector: el propio código actual documenta por qué no hay abstracción (`webSearch.service.ts`: *"no montar un registro de proveedores para el que hoy solo hay uno"*). Ese criterio era correcto y deja de serlo en el momento en que hay ≥2 proveedores reales por capacidad. **Solo se abstrae lo que ya tiene o va a tener segundo proveedor en esta fase**: LLM, TTS, imagen. Telefonía, ads y email declaran capability pero mantienen implementación única.

---

## 1. Taxonomía de capacidades

Identificadores estables tipo `familia.accion`:

```
llm.generate          llm.stream            llm.extract
image.generate        image.edit            image.upscale        image.relight
video.generate        video.lipsync         video.upscale
audio.tts             audio.tts_stream      audio.stt            audio.stt_stream
audio.music           audio.sfx
call.outbound         call.inbound          messaging.whatsapp    messaging.sms
ads.publish           ads.insights          social.publish        social.metrics
web.search            web.fetch             places.search
email.transactional   email.marketing
enrich.company        enrich.person
```

Cada capability define en TypeScript su **contrato de entrada/salida normalizado** (zod, ya en dependencias). Ejemplo:

```ts
// backend/src/providers/capabilities/imageGenerate.ts
export const imageGenerateInput = z.object({
  prompt: z.string().max(4000),
  refImages: z.array(z.string()).optional(), // assetIds
  aspectRatio: z.enum(['1:1','9:16','16:9','4:5']).default('1:1'),
  quality: z.enum(['draft','final']).default('draft'),
});
export const imageGenerateOutput = z.object({
  assetIds: z.array(z.string()),
});
```

---

## 2. Estructura de código

```
backend/src/providers/
  registry.ts               // registro en memoria, compilado (NO tabla BD en fase 1)
  types.ts                  // ProviderDescriptor, CapabilityBinding
  capabilities/*.ts         // contratos zod por capability
  adapters/
    deepseek.ts             // envuelve lib/deepseek.ts existente
    cerebras.ts
    openaiImage.ts          // envuelve assetGenerator.service.ts
    magnific.ts             // NUEVO
    runway.ts               // NUEVO (fase 2)
    cartesia.ts  minimax.ts  elevenlabs.ts  chatterbox.ts  // envuelven backend/src/voice/*
    twilio.ts  resend.ts  metricool.ts  brave.ts
```

**Regla:** los adapters envuelven los clientes existentes, no los sustituyen. `lib/deepseek.ts` y `voice/tts/minimaxTts.ts` no se tocan; se les pone un descriptor delante. El pipeline de llamadas en vivo (`voice/engine/factory.ts`) **queda fuera del router en fase 1** — su latencia es crítica y su combinación está afinada; se registra como binding fijo y se enruta más adelante si hace falta.

---

## 3. El descriptor de proveedor (§2.4 de la visión)

```ts
export interface ProviderDescriptor {
  id: string;                    // "magnific"
  displayName: string;
  capabilities: CapabilityBinding[];
  auth: {
    modes: ('managed' | 'byok')[];      // §2.1 de la visión; "enterprise" = byok + política
    byokFields?: SecretFieldSpec[];     // qué pedir al cliente (apiKey, accountSid...)
    testConnection(secret: Json): Promise<TestResult>;  // botón "probar" del centro de conexiones
  };
  regions?: string[];
  commercialUseAllowed: boolean;        // revisado contra ToS, con fecha
  tosReviewedAt: string;                // "2026-08-18"
  docsUrl: string;
}

export interface CapabilityBinding {
  capability: string;            // "image.upscale"
  models?: string[];             // variantes concretas
  estimateCost(input: unknown): Promise<{ cents: number; confidence: 'exact'|'estimate' }>;
  execute(ctx: ProviderCtx, input: unknown): Promise<unknown>;   // síncrono
  submit?(ctx, input): Promise<{ providerJobId: string }>;       // asíncrono (vídeo, upscale)
  fetchResult?(ctx, providerJobId): Promise<unknown>;
  limits: { rpm?: number; concurrent?: number; maxDurationS?: number };
  qualityTier: 'draft' | 'standard' | 'premium';
  avgLatencyMs?: number;         // actualizado desde UsageRecord/Job reales
}
```

`ProviderCtx` incluye `orgId`, credencial resuelta, `jobId`, y el `fetchWithTimeout`/`assertSafeOutboundUrl` de `lib/integrationRuntime.ts` (obligatorio para cualquier adapter que reciba URLs del usuario).

Notas:

- El registro es **código compilado**, no BD. Las métricas dinámicas (latencia real, tasa de fallo, coste medio) se leen de `UsageRecord`/`Job` y se cachean; los hechos estáticos (ToS, regiones, campos BYOK) viven en el descriptor y se revisan en PR. Esto responde a §12 "depender de proveedores que cambian": cada cambio de condiciones es un diff revisable.
- `estimateCost` es obligatorio. Sin estimación no hay entrada en el router ni en la UI (§13.9 de la visión).

---

## 4. Generalizar BYOK

Cambios sobre `organizationCredentials.service.ts`:

1. `ORGANIZATION_CREDENTIAL_PROVIDERS` deja de ser un array literal y se deriva del registro: `providers.filter(p => p.auth.modes.includes('byok')).map(p => p.id)`. La validación `INTEGRATION_PROVIDER_NOT_SUPPORTED` se mantiene idéntica.
2. `SecretFieldSpec` del descriptor alimenta el formulario del frontend (hoy cada proveedor tiene formulario a medida en `/configuracion`).
3. `testConnection()` del descriptor implementa el botón "probar" del Centro de conexiones (§8.3 de la visión) y actualiza `status`/`lastError` con la maquinaria existente (`markUsed`/`markError`).
4. Nuevo endpoint `GET /api/integrations/catalog` → lista de proveedores con capabilities, modos, campos BYOK y estado de conexión de la org (merge del registro + `credentialMetadata()` existente).

### Resolución de credencial en tiempo de ejecución

Un solo camino, calcado de `resolveOrganizationCredentialConfig()` actual:

```
1. Credencial BYOK de la org (BD, descifrada)         → billingMode = "byok"
2. Override por env para migraciones (patrón actual)   → billingMode = "byok"
3. Clave global de Vendrava, si el flag lo permite     → billingMode = "managed"
   (requiere Wallet con saldo o plan que lo incluya)
4. Nada → error accionable con link al centro de conexiones
```

`billingMode` viaja en `ProviderCtx` y acaba en cada `UsageRecord` — es lo que separa contablemente BYOK de gestionado.

---

## 5. Primeras integraciones nuevas

### Magnific (`image.upscale`, `image.relight`, `image.generate`)

La candidata ideal para estrenar el patrón de media: API oficial documentada, webhooks, créditos propios, encaja como BYOK y como gestionado, y cierra el flujo demo («anuncio con imagen mejorada»).

> **Anotación de revisión:** un MCP disponible en una sesión de desarrollo no forma parte del backend desplegado ni demuestra autorización para un SaaS multiusuario. Puede servir para exploración manual, pero el adapter de producción debe usar una vía soportada para aplicaciones, con revisión contractual, autenticación, firma de webhook, límites y facturación propias.

- Modo asíncrono: `submit()` + webhook entrante `POST /api/webhooks/providers/magnific` (verificación de firma; reutilizar el patrón de `metaLeadWebhook.service.ts`).
- El resultado crea `AssetVersion` sobre el asset original (genealogía de §2.7).

### Anthropic / OpenAI chat (`llm.generate`) como segunda opción de LLM

- Solo BYOK en fase 1 (sin coste para Vendrava, valida el enrutado de LLM).
- Los servicios de contenido siguen llamando a DeepSeek por defecto; el router permite a la org fijar otro proveedor (§2.2 "el usuario avanzado sí debería poder elegir").

### Runway (`video.generate`) — inicio de fase 2

- Primer proveedor de vídeo; asíncrono puro sobre `Job`.
- Conservar siempre el modelo real usado en `UsageRecord.meta` y `Asset.model` (advertencia explícita de la visión §3: no perder la identidad del modelo detrás del agregador).

---

## 6. Centro de conexiones (frontend)

Ampliar `/configuracion` (o nueva ruta `/conexiones`) con la lista de §8.3 de la visión. Casi todo existe ya en `credentialMetadata()`: estado, scopes, expiración, `lastUsedAt`, `lastError`. Añadir:

- consumo del mes (query a `UsageRecord` por provider),
- "qué dejaría de funcionar si desconectas" → se calcula de las recetas/automatizaciones activas que referencian la capability (05-FLUJOS §4),
- botón probar (`testConnection`).

---

## 7. Criterios de salida de la Fase 1

- [ ] Registro con ≥10 proveedores descritos (los 8 existentes + Magnific + 1 LLM BYOK).
- [ ] `image.generate` e `image.upscale` funcionando vía router con coste estimado visible antes de ejecutar.
- [ ] Centro de conexiones con catálogo, test y consumo.
- [ ] `contentVoiceover.service.ts` (el único router real actual, Chatterbox→ElevenLabs) migrado al registro como prueba de que el patrón cubre el caso real más antiguo.
- [ ] Cero regresiones en el pipeline de llamadas en vivo (que queda fuera del router a propósito).
