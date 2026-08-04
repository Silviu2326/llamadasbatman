# Migración del motor de voz: llamadas → llamadasrobin

> Objetivo: eliminar el servicio Python `llamadas` y portar todo el motor de voz a TypeScript dentro de `llamadasrobin/backend/src/voice/`. El sistema resultante es un monolito Node.js completamente independiente.
>
> Última actualización: 2026-06-28

---

## Índice

1. [Arquitectura objetivo](#1-arquitectura-objetivo)
2. [Estructura de directorios a crear](#2-estructura-de-directorios-a-crear)
3. [Dependencias npm a instalar](#3-dependencias-npm-a-instalar)
4. [Variables de entorno requeridas](#4-variables-de-entorno-requeridas)
5. [Fases de implementación](#5-fases-de-implementación)
6. [Inventario de archivos Python → TypeScript](#6-inventario-de-archivos-python--typescript)
7. [Especificaciones técnicas por módulo](#7-especificaciones-técnicas-por-módulo)
8. [Contratos de API Twilio](#8-contratos-de-api-twilio)
9. [Flujo completo de una llamada](#9-flujo-completo-de-una-llamada)
10. [Checklist de implementación](#10-checklist-de-implementación)

---

## 1. Arquitectura objetivo

```
llamadasrobin/
├── backend/                          ← único servicio Node.js
│   └── src/
│       ├── routes/                   ← CRM API (existente)
│       ├── voice/                    ← NUEVO — motor de voz completo
│       │   ├── telephony/            ← Twilio webhooks + WebSocket
│       │   ├── audio/                ← Codec μ-law ↔ PCM + DSP
│       │   ├── stt/                  ← Deepgram STT streaming
│       │   ├── tts/                  ← ElevenLabs TTS streaming
│       │   ├── pipelines/            ← Pipeline principal (orquesta todo)
│       │   ├── intelligence/         ← Guru + FastExecutor + estado
│       │   │   ├── conversation/     ← CallContext, GuruBrief, 13 estructuras
│       │   │   └── llm/              ← Cerebras, Claude, Gemini clients
│       │   ├── coordinator.ts        ← CallRhythm + feedback loop
│       │   ├── compliance.ts         ← Horario legal + opt-out México
│       │   └── agentConfig.ts        ← Sistema LEGO de config de agente
│       └── index.ts                  ← + registrar rutas de voz
└── src/                              ← React frontend (sin cambios)
```

**Puerto único:** `3000` — el mismo servidor Fastify atiende CRM + voz.

---

## 2. Estructura de directorios a crear

```
backend/src/voice/
├── telephony/
│   ├── twilioClient.ts           # Llamadas salientes, TwiML
│   └── mediaStream.ts            # WebSocket handler Twilio Media Streams
├── audio/
│   ├── bridge.ts                 # μ-law 8k ↔ PCM16 16k/24k
│   ├── dsp.ts                    # RMS, noise gate, AGC
│   ├── noiseClassifier.ts        # Clasifica ruido → ajusta VAD
│   └── prosodic.ts               # Análisis prosódico por turno
├── stt/
│   └── deepgram.ts               # DeepgramSTT streaming (5 eventos Flux v2)
├── tts/
│   ├── elevenLabsTts.ts          # ElevenLabsTTS streaming
│   └── voiceProfiles.ts          # 11 perfiles de voz + apply_modifiers
├── pipelines/
│   └── deepgramElevenLabs.ts     # Pipeline principal — orquesta todo
├── intelligence/
│   ├── conversation/
│   │   ├── callContext.ts        # CallContext + ConversationStore
│   │   ├── guruBrief.ts          # GuruBrief + 13 estructuras + 11 formatos
│   │   ├── fastExecutor.ts       # FastExecutor (Cerebras)
│   │   └── guruSupervisor.ts     # GuruSupervisor (Claude) + detectors
│   └── llm/
│       ├── cerebras.ts           # CerebrasAgent (OpenAI-compat)
│       └── gemini.ts             # GeminiProvider (fallback)
├── coordinator.ts                # CallRhythm + FORMAT_STT_CONFIG + utterance classifier
├── compliance.ts                 # México: horario legal, opt-out, disclosure
└── agentConfig.ts                # AgentConfig + loader (cache → Prisma → default)
```

---

## 3. Dependencias npm a instalar

```bash
# Añadir a backend/package.json
npm install \
  twilio \
  @deepgram/sdk \
  elevenlabs \
  openai \
  @anthropic-ai/sdk \
  @google/genai \
  @fastify/websocket \
  @fastify/formbody \
  ioredis
```

| Paquete | Versión mínima | Uso |
|---------|---------------|-----|
| `twilio` | 5.x | TwiML, llamadas salientes, transferencias |
| `@deepgram/sdk` | 3.x | STT streaming Flux v2 |
| `elevenlabs` | latest | TTS streaming |
| `openai` | 4.x | Cerebras (API compatible OpenAI) |
| `@anthropic-ai/sdk` | 0.x | Claude (Guru) |
| `@google/genai` | latest | Gemini (fallback LLM) |
| `@fastify/websocket` | 9.x | WebSocket para Twilio Media Streams |
| `@fastify/formbody` | 7.x | Parsear POST de Twilio (form-data) |
| `ioredis` | ya instalado | Persistencia de CallContext |

---

## 4. Variables de entorno requeridas

Añadir a `llamadasrobin/backend/.env`:

```env
# ── Twilio ──────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+521XXXXXXXXXX
HUMAN_TRANSFER_NUMBER=+521XXXXXXXXXX
# Estrategia caller ID: "static" | "dynamic"
CALLER_ID_STRATEGY=static
# JSON mapping LADA → número (solo si dynamic)
# TWILIO_MX_NUMBERS={"55":"+5255XXXXXXXX","33":"+5233XXXXXXXX"}
PUBLIC_HOST=localhost:3000

# ── Deepgram STT ────────────────────────────────────
DEEPGRAM_API_KEY=
DEEPGRAM_MODEL=flux-general-multi
DEEPGRAM_LANGUAGE=es

# ── ElevenLabs TTS ──────────────────────────────────
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=ErXwobaYiN019PkySvjV
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
ELEVENLABS_TTS_FORMAT=pcm_24000
ELEVENLABS_LATENCY_OPT=0

# ── LLM Rápido: Cerebras ────────────────────────────
CEREBRAS_API_KEY=
CEREBRAS_MODEL=llama-3.3-70b
CEREBRAS_TIMEOUT_SECONDS=8

# ── LLM Guru: Claude ────────────────────────────────
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-6
CLAUDE_TIMEOUT_SECONDS=30
GURU_CHECK_INTERVAL=3
DUAL_MODEL_ENABLED=true

# ── LLM Fallback: Gemini ────────────────────────────
GEMINI_API_KEY=
GEMINI_CHAT_MODEL=gemini-2.5-flash

# ── VAD / Latencia ──────────────────────────────────
VAD_SILENCE_MS=200
VAD_PREFIX_PADDING_MS=200

# ── Compliance ──────────────────────────────────────
DISCLOSE_AI=true
CALL_HOUR_START=9
CALL_HOUR_END=20
# Zona horaria por defecto para números no mexicanos (horario legal de llamada)
DEFAULT_CALL_TIMEZONE=America/Mexico_City
# Prefijo por defecto para números nacionales de 10 dígitos (52 = México, 1 = EE. UU.)
DEFAULT_PHONE_COUNTRY_CODE=52
# always: graba desde el inicio | consent: solo tras consentimiento en llamada | off: nunca
CALL_RECORDING_POLICY=always
# true: canCall() exige ContactConsent(channel=voice, status=granted) del lead
REQUIRE_VOICE_CONSENT=false
```

---

## 5. Fases de implementación

### Fase 1 — Infraestructura de audio y Twilio (2-3h)
**Resultado:** llamadas entran y el audio fluye bidireccional (sin IA todavía).

- [ ] Instalar `@fastify/websocket`, `@fastify/formbody`, `twilio`
- [ ] `audio/bridge.ts` — conversión μ-law ↔ PCM
- [ ] `audio/dsp.ts` — RMS, noise gate, AGC
- [ ] `telephony/twilioClient.ts` — TwiML, llamadas salientes
- [ ] `telephony/mediaStream.ts` — WebSocket handler (solo audio, sin IA)
- [ ] Registrar rutas en `index.ts`: `POST /voice`, `WS /media`, `POST /outbound`

### Fase 2 — STT + TTS (2-3h)
**Resultado:** se transcribe lo que dice el prospecto y el agente responde en voz (con texto hardcodeado).

- [ ] `stt/deepgram.ts` — DeepgramSTT con 5 eventos Flux v2
- [ ] `tts/voiceProfiles.ts` — 11 VoiceProfile + apply_modifiers + preprocess_text
- [ ] `tts/elevenLabsTts.ts` — ElevenLabsTTS streaming
- [ ] Cablear STT → transcripción → TTS en `mediaStream.ts`
- [ ] `audio/noiseClassifier.ts` — adapta eot_timeout por ruido de fondo
- [ ] `audio/prosodic.ts` — ProsodicBuffer, AcousticState

### Fase 3 — LLM + estado de conversación (2-3h)
**Resultado:** el agente habla con sentido, mantiene contexto.

- [ ] `intelligence/conversation/callContext.ts` — CallContext + ConversationStore (Redis)
- [ ] `intelligence/llm/cerebras.ts` — CerebrasAgent + LatencyMetrics
- [ ] `intelligence/conversation/guruBrief.ts` — GuruBrief + 13 estructuras + to_system_prompt()
- [ ] `intelligence/conversation/fastExecutor.ts` — FastExecutor (Cerebras)
- [ ] `coordinator.ts` — CallRhythm + FORMAT_STT_CONFIG + classify_utterance
- [ ] `agentConfig.ts` — AgentConfig + loader (Prisma → default)
- [ ] Integrar en pipeline completo `pipelines/deepgramElevenLabs.ts`

### Fase 4 — Guru + inteligencia de ventas (3-4h)
**Resultado:** sistema de IA de ventas completo, 13 estructuras, detección de objeciones.

- [ ] `intelligence/conversation/guruSupervisor.ts` — GuruSupervisor (Claude)
- [ ] Detector de objeciones (8 tipos + regex patterns)
- [ ] Detector de loops y stalls
- [ ] `fast_dispatch()` — fallback determinista sin Claude
- [ ] Activar dual-model en pipeline
- [ ] Coordinator: ajuste dinámico de STT config por formato
- [ ] Voice overlay por tipo de utterance (closing_question, challenge, story, data)

### Fase 5 — Compliance + integración CRM (1-2h)
**Resultado:** sistema listo para producción.

- [ ] `compliance.ts` — horario legal México, opt-out, disclosure
- [ ] Integrar con Prisma: leer Lead por phone, escribir Call al terminar
- [ ] Campaña dispatch: `POST /campaigns/start` (ya existe, adaptar)
- [ ] Ingest post-llamada a tabla `Call` de Prisma (ya existe `/api/calls/ingest`)
- [ ] `intelligence/llm/gemini.ts` — fallback si Cerebras falla
- [ ] Tests manuales: llamada completa end-to-end

---

## 6. Inventario de archivos Python → TypeScript

| Python (llamadas) | TypeScript (llamadasrobin) | Complejidad |
|-------------------|---------------------------|-------------|
| `voice/audio/bridge.py` | `voice/audio/bridge.ts` | Media — μ-law es matemática pura |
| `voice/audio/dsp.py` | `voice/audio/dsp.ts` | Baja — Buffer ops + RMS |
| `voice/audio/noise_classifier.py` | `voice/audio/noiseClassifier.ts` | Baja |
| `voice/audio/prosodic.py` | `voice/audio/prosodic.ts` | Media — ZCR + feature extraction |
| `voice/stt/deepgram.py` | `voice/stt/deepgram.ts` | Media — SDK diferente |
| `voice/tts/elevenlabs_tts.py` | `voice/tts/elevenLabsTts.ts` | Media — streaming HTTP |
| `voice/tts/voice_profiles.py` | `voice/tts/voiceProfiles.ts` | Baja — datos puros |
| `voice/coordinator.py` | `voice/coordinator.ts` | Media — lógica de ritmo |
| `voice/pipelines/deepgram_elevenlabs.py` | `voice/pipelines/deepgramElevenLabs.ts` | Alta — orquesta todo |
| `voice/telephony/twilio_client.py` | `voice/telephony/twilioClient.ts` | Baja — SDK equivalente |
| `voice/telephony/media_stream.py` | `voice/telephony/mediaStream.ts` | Alta — WebSocket + lifecycle |
| `intelligence/conversation/state.py` | `intelligence/conversation/callContext.ts` | Baja — dataclass → interface |
| `intelligence/conversation/fast_executor.py` | `intelligence/conversation/fastExecutor.ts` | Media |
| `intelligence/conversation/guru_supervisor.py` | `intelligence/conversation/guruSupervisor.ts` | Alta — Claude + detectors |
| `intelligence/llm/cerebras.py` | `intelligence/llm/cerebras.ts` | Baja — OpenAI SDK |
| `intelligence/llm/gemini_provider.py` | `intelligence/llm/gemini.ts` | Baja |
| `modules/loader.py + types.py` | `voice/agentConfig.ts` | Media |
| `compliance/mx.py` | `voice/compliance.ts` | Baja |

---

## 7. Especificaciones técnicas por módulo

### 7.1 `audio/bridge.ts`

**Propósito:** Convertir audio entre Twilio (μ-law 8 kHz) y los modelos de IA (PCM16 16 kHz/24 kHz).

```typescript
// Constantes
const TWILIO_RATE = 8000        // μ-law input
const GEMINI_IN_RATE = 16000    // PCM16 para STT
const GEMINI_OUT_RATE = 24000   // PCM16 de TTS
const TWILIO_FRAME_BYTES = 160  // frame de 20ms @ 8kHz

// Tabla de lookup μ-law → linear (256 valores)
// Implementar algoritmo ITU-T G.711

class AudioBridge {
  twilioToGemini(ulaw8k: Buffer): Buffer      // μ-law 8k → PCM16 16k (upsample x2)
  geminiToTwilioFrames(pcm24k: Buffer): Buffer[] // PCM16 24k → μ-law frames + buffer
  packUlawFrames(ulaw: Buffer): Buffer[]      // ElevenLabs ulaw_8000 → frames directos
  clearOutput(): void                          // barge-in: vaciar buffer
  flush(): Buffer[]                            // completar frames con silencio (0xFF)
}
```

**Nota de implementación:** No existe `audioop` en Node.js. La conversión μ-law se implementa con una tabla de lookup de 256 entradas (algoritmo ITU-T G.711). El resampling 8k→16k es interpolación lineal; 24k→8k es decimación por 3.

```typescript
// μ-law decode lookup (256 valores)
const ULAW_TABLE = new Int16Array(256)
// μ-law encode lookup (32768 valores) o algoritmo directo
```

---

### 7.2 `audio/dsp.ts`

```typescript
function rmsLevel(pcm: Buffer): number              // normalized [0, 1]
function isSpeech(pcm: Buffer, threshold = 0.02): boolean
function autoGain(pcm: Buffer, targetRms = 0.12, maxGain = 4.0): Buffer
function noiseGate(pcm: Buffer, floor = 0.01): Buffer
function preprocessInbound(pcm: Buffer): Buffer     // noiseGate + autoGain
```

**Nota:** PCM16 little-endian. Usar `Buffer.readInt16LE()` en loop, convertir a float32 dividiendo por 32768.

---

### 7.3 `audio/noiseClassifier.ts`

```typescript
type NoiseType = 'limpio' | 'ruido_constante' | 'ruido_impulsivo'

const EOT_MS: Record<NoiseType, number> = {
  limpio: 2500,
  ruido_constante: 3500,
  ruido_impulsivo: 4000,
}

class NoiseClassifier {
  // Ventana de 150 frames (3s @ 20ms), recalcula cada 30 frames
  setSpeaking(speaking: boolean): void
  update(rms: number): void
  noiseTypeChanged(): boolean        // true si cambió vs último reportado
  currentType(): NoiseType
  suggestedEotMs(): number
}
```

---

### 7.4 `audio/prosodic.ts`

```typescript
interface ProsodicFeatures {
  meanRms: number; rmsStd: number; zcrMean: number
  speechRatio: number; speakingRate: number; durationS: number
}

type AcousticLabel = 'agitado' | 'energico' | 'tenso' | 'calmado' | 'plano'

interface AcousticState {
  label: AcousticLabel
  confidence: number    // [0, 1]
  features: ProsodicFeatures
}

class ProsodicBuffer {
  startTurn(): void
  add(pcm: Buffer): void
  stopTurn(): void
  analyze(wordCount?: number): AcousticState | null
}
```

**Clasificación (prioridad):**
1. `agitado` → meanRms > 0.15 AND zcrMean > 0.07
2. `energico` → meanRms > 0.08 AND rmsStd > 0.035
3. `tenso` → zcrMean > 0.09 AND 0.03 < meanRms < 0.12
4. `calmado` → 0.03 ≤ meanRms ≤ 0.10
5. `plano` → default

---

### 7.5 `stt/deepgram.ts`

**SDK:** `@deepgram/sdk` v3 — `createClient().listen.live()`

```typescript
type STTCallback = (text: string) => void
type STTCallbackWithConf = (text: string, confidence: number) => void
type VADCallback = () => void

class DeepgramSTT {
  constructor(config: {
    apiKey: string
    model?: string           // 'flux-general-multi'
    language?: string        // 'es'
    keywords?: string[]
    eotTimeoutMs?: number    // end-of-turn timeout
    eotThreshold?: number    // [0,1]
    eagerEotThreshold?: number
    onPartial?: STTCallback
    onEagerEnd?: STTCallbackWithConf
    onTurnResumed?: VADCallback
    onFinal?: STTCallback
    onUserStartedSpeaking?: VADCallback
    onUserStoppedSpeaking?: VADCallback
  })

  start(): Promise<void>
  sendAudio(audio: Buffer): Promise<void>
  configure(params: Partial<{
    eotTimeoutMs: number
    eotThreshold: number
    eagerEotThreshold: number
    languageHints: string[]
  }>): Promise<void>
  close(): Promise<void>
}
```

**5 eventos Flux v2 que el SDK emite:**
| Evento Deepgram | Handler |
|-----------------|---------|
| `StartOfTurn` | `onUserStartedSpeaking()` |
| `Update` | `onPartial(text)` |
| `EagerEndOfTurn` | `onEagerEnd(text, confidence)` |
| `TurnResumed` | `onTurnResumed()` |
| `EndOfTurn` | `onUserStoppedSpeaking()` + `onFinal(text)` |

**Configuración dinámica (sin reconectar):** enviar mensaje `Configure` al socket con nuevos thresholds.

---

### 7.6 `tts/voiceProfiles.ts`

```typescript
interface VoiceProfile {
  readonly stability: number
  readonly similarityBoost: number
  readonly style: number
  readonly speed: number
  readonly pauseAfterQMs: number
  readonly pauseStoryBeatMs: number
}

// 11 perfiles
const VOICE_PROFILES: Record<string, VoiceProfile> = {
  directo:      { stability: 0.30, similarityBoost: 0.75, style: 0.60, speed: 1.05, pauseAfterQMs: 200, pauseStoryBeatMs: 250 },
  cercano:      { stability: 0.22, similarityBoost: 0.78, style: 0.72, speed: 0.90, pauseAfterQMs: 350, pauseStoryBeatMs: 300 },
  consultivo:   { stability: 0.48, similarityBoost: 0.80, style: 0.42, speed: 0.86, pauseAfterQMs: 450, pauseStoryBeatMs: 400 },
  challenger:   { stability: 0.16, similarityBoost: 0.72, style: 0.86, speed: 0.97, pauseAfterQMs: 280, pauseStoryBeatMs: 350 },
  storyteller:  { stability: 0.12, similarityBoost: 0.70, style: 0.90, speed: 0.85, pauseAfterQMs: 400, pauseStoryBeatMs: 500 },
  snap:         { stability: 0.32, similarityBoost: 0.76, style: 0.55, speed: 1.12, pauseAfterQMs: 150, pauseStoryBeatMs: 200 },
  empatico:     { stability: 0.58, similarityBoost: 0.82, style: 0.32, speed: 0.81, pauseAfterQMs: 500, pauseStoryBeatMs: 450 },
  urgente:      { stability: 0.14, similarityBoost: 0.74, style: 0.88, speed: 1.14, pauseAfterQMs: 180, pauseStoryBeatMs: 220 },
  tecnico:      { stability: 0.62, similarityBoost: 0.85, style: 0.26, speed: 0.88, pauseAfterQMs: 380, pauseStoryBeatMs: 350 },
  social_proof: { stability: 0.20, similarityBoost: 0.76, style: 0.76, speed: 0.93, pauseAfterQMs: 320, pauseStoryBeatMs: 380 },
  mini_closer:  { stability: 0.26, similarityBoost: 0.78, style: 0.66, speed: 0.92, pauseAfterQMs: 300, pauseStoryBeatMs: 320 },
}

// Modificadores por emoción/estado acústico del prospecto
// Emoción → delta speed, delta style, delta stability
const EMOTION_MODIFIERS = {
  agitado:    { speed: -0.12, style: -0.15, stability: +0.15 },
  molesto:    { speed: -0.10, style: -0.20, stability: +0.15 },
  interesado: { speed: +0.05, style: +0.08, stability: 0 },
  plano:      { speed: +0.03, style: +0.10, stability: 0 },
}

const ACOUSTIC_MODIFIERS = {
  agitado: { speed: -0.08, style: 0, stability: 0 },
  tenso:   { speed: -0.05, style: 0, stability: 0 },
  plano:   { speed: +0.04, style: 0, stability: 0 },
}

function getProfile(formato: string): VoiceProfile
function applyModifiers(base: VoiceProfile, emocion: string, estadoAcustico: string): VoiceProfile
function preprocessText(text: string, profile: VoiceProfile): string  // inyecta pausas
```

---

### 7.7 `tts/elevenLabsTts.ts`

**Endpoint:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream`

```typescript
type AudioCallback = (audio: Buffer) => Promise<void>

class ElevenLabsTTS {
  constructor(config: {
    apiKey: string
    voiceId: string
    onAudio: AudioCallback
    sampleRate?: number          // 24000
    outputFormat?: string        // 'pcm_24000'
    modelId?: string             // 'eleven_flash_v2_5'
    latencyOptimization?: number // 0
  })

  start(): Promise<void>
  close(): Promise<void>
  sendText(text: string, flush?: boolean): Promise<void>
  flush(): Promise<void>
  cancel(): Promise<void>
  setVoiceProfile(formato: string): void
  setProspectSignals(emocion: string, estadoAcustico: string): void
}
```

**Body del POST a ElevenLabs:**
```json
{
  "text": "texto preprocesado con pausas",
  "model_id": "eleven_flash_v2_5",
  "voice_settings": {
    "stability": 0.22,
    "similarity_boost": 0.78,
    "style": 0.72,
    "use_speaker_boost": true,
    "speed": 0.90
  },
  "optimize_streaming_latency": 0
}
```

**Lógica de buffer:** acumular texto hasta 200 chars O hasta `flush=true`. Esto reduce las llamadas HTTP y mejora la naturalidad del audio.

---

### 7.8 `intelligence/conversation/callContext.ts`

```typescript
interface CallContext {
  callSid: string
  phone: string
  businessType: string
  businessName: string
  city: string

  // CRM (Prisma IDs)
  orgId: string
  campaignId: string
  agentId: string       // cuid de Prisma
  leadId: string

  // Configuración del agente
  agentConfig: AgentConfig | null

  // Datos del prospecto
  prospect: Record<string, unknown>

  // Estado de conversación
  turns: number
  transcript: Array<{ role: string; text: string }>
  transferRequested: boolean
  transferReason: string
  frustration: number   // 0-10
  emotion: string       // 'neutro' | 'interesado' | 'frustrado' | 'molesto'
  outcome: string       // 'en_curso' | 'demo_agendada' | 'transferido' | 'rechazado' | 'optout'

  startedAt: number     // Date.now()
  metadata: Record<string, unknown>

  // Compliance
  recordingConsentPending: boolean
  recordingConsented: boolean
}

// Helpers
function createCallContext(params: Partial<CallContext>): CallContext
function elapsedSeconds(ctx: CallContext): number

// Persistencia en Redis
class ConversationStore {
  constructor(redisClient: Redis)
  save(ctx: CallContext): Promise<void>     // TTL 86400s
  load(callSid: string): Promise<CallContext | null>
}
```

---

### 7.9 `intelligence/conversation/guruBrief.ts`

```typescript
const VALID_ESTRUCTURAS = [
  'AIDA', 'SPIN', 'SNAP', 'CHALLENGER', 'CONSULTIVA',
  'SANDLER', 'FAB', 'STORYTELLING', 'PAS', 'BYAF', 'NEAT', 'SOLUTION', 'VALUE'
] as const

const VALID_FORMATOS = [
  'directo', 'cercano', 'consultivo', 'challenger', 'storyteller',
  'snap', 'empatico', 'urgente', 'tecnico', 'social_proof', 'mini_closer'
] as const

type Estructura = typeof VALID_ESTRUCTURAS[number]
type Formato = typeof VALID_FORMATOS[number]

interface GuruBrief {
  objetivo: string
  estructura: Estructura
  formato: Formato
  tono: string
  maxFrases: number           // 1-4
  siguienteObjetivo: string
  fraseGuia: string
  puntosClave: string[]
  prohibiciones: string[]
  bucleDetectado: boolean
  objecionTipo: string        // '' | 'es_caro' | 'ya_tenemos' | etc.
  stallDetectado: boolean
}

function defaultBrief(): GuruBrief
function briefToSystemPrompt(brief: GuruBrief): string  // serializa como bloque de instrucciones
```

---

### 7.10 `intelligence/conversation/fastExecutor.ts`

**API:** Cerebras (compatible OpenAI) — `https://api.cerebras.ai/v1/chat/completions`

```typescript
interface LatencyMetrics {
  ttftMs: number
  totalTimeMs: number
  tokensGenerated: number
  tokensPerSecond: number
}

class FastExecutor {
  constructor(apiKey: string, model?: string)  // model default: 'llama-3.3-70b'

  execute(params: {
    userInput: string
    conversationHistory: Array<{ role: string; text: string }>
    brief?: GuruBrief
    agentConfig?: AgentConfig
  }): Promise<{ response: string; metrics: LatencyMetrics }>

  classifyEmotion(text: string, acousticState: string): Promise<string>

  close(): Promise<void>
}
```

**Config del POST:**
```json
{
  "model": "llama-3.3-70b",
  "max_tokens": 200,
  "temperature": 0.7,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "último turno" }
  ]
}
```

Usar el paquete `openai` apuntando a `baseURL: 'https://api.cerebras.ai/v1'`.

---

### 7.11 `intelligence/conversation/guruSupervisor.ts`

**API:** Anthropic Claude — `@anthropic-ai/sdk`

```typescript
// 8 tipos de objeción con regex patterns
const OBJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/muy caro|no (tenemos|hay) presupuesto|precio/i, 'es_caro'],
  [/ya (tenemos|usamos|contamos)/i, 'ya_tenemos'],
  [/no es (buen|el) momento|luego|después/i, 'no_es_buen_momento'],
  [/necesito (consultarlo|hablarlo|pensarlo)/i, 'necesito_consultarlo'],
  [/mándame (info|información)/i, 'mandame_info'],
  [/no me interesa|no gracias/i, 'no_me_interesa'],
  [/no (tengo|hay) tiempo/i, 'no_tengo_tiempo'],
  [/ja|claro|cómo no|ajá/i, 'sarcastico'],
]

// Playbook: qué hacer ante cada objeción
const OBJECTION_PLAYBOOK: Record<string, {
  estructura: Estructura
  formato: Formato
  tono: string
  siguienteObjetivo: string
  fraseGuia: string
  prohibiciones: string[]
}> = {
  es_caro: {
    estructura: 'VALUE',
    formato: 'directo',
    // ...
  },
  // 7 más...
}

function detectObjection(text: string): string        // '' si no hay objeción
function detectLoop(agentResponses: string[]): boolean  // >50% vocab compartido en últimas 3
function detectStall(neutralTurns: number): boolean     // >= 4 turnos neutros

function fastDispatch(params: {
  current: GuruBrief
  emocion: string
  estadoAcustico: string
  loop: boolean
  stall: boolean
  objecionTipo: string
  triedEstructuras: string[]
}): GuruBrief  // fallback determinista sin Claude

class GuruSupervisor {
  constructor(apiKey: string, model?: string)  // model default: env CLAUDE_MODEL

  analyzeAndBrief(params: {
    conversationHistory: Array<{ role: string; text: string }>
    lastResponse: string
    objective: string
    callContext: Partial<CallContext>
    emocion: string
    estadoAcustico: string
    loopDetected: boolean
    stallDetected: boolean
    objecionTipo: string
    triedEstructuras: string[]
  }): Promise<GuruBrief>  // fallback a fastDispatch si Claude falla/timeout

  close(): Promise<void>
}
```

**Prompt a Claude (JSON response forzado):**
- Last 8 turns del historial
- Estado emocional y acústico actual
- Objeción activa (si existe)
- Estructuras ya intentadas
- Señales de loop/stall
- Response format: `{ estructura, formato, siguiente_objetivo, tono, max_frases, frase_guia, puntos_clave, prohibiciones }`

---

### 7.12 `coordinator.ts`

```typescript
// Config de Deepgram por formato de venta
const FORMAT_STT_CONFIG: Record<string, {
  eotTimeoutMs: number
  eotThreshold: number
  eagerEotThreshold: number
}> = {
  empatico:    { eotTimeoutMs: 3500, eotThreshold: 0.76, eagerEotThreshold: 0.58 },
  consultivo:  { eotTimeoutMs: 3200, eotThreshold: 0.74, eagerEotThreshold: 0.55 },
  mini_closer: { eotTimeoutMs: 3200, eotThreshold: 0.75, eagerEotThreshold: 0.56 },
  snap:        { eotTimeoutMs: 1800, eotThreshold: 0.62, eagerEotThreshold: 0.42 },
  urgente:     { eotTimeoutMs: 1800, eotThreshold: 0.62, eagerEotThreshold: 0.42 },
  cercano:     { eotTimeoutMs: 2500, eotThreshold: 0.70, eagerEotThreshold: 0.50 },
  // default para formatos no listados:
  _default:    { eotTimeoutMs: 2500, eotThreshold: 0.70, eagerEotThreshold: 0.50 },
}

interface CallRhythm {
  prospectWordCounts: number[]    // rolling window 6
  agentWordCounts: number[]       // rolling window 6
  interruptionCount: number
  ttsCompletions: number
  prospectSpeakingRates: number[] // rolling window 5

  // Derivadas
  avgProspectWords: number
  avgAgentWords: number
  interruptionRate: number        // interruptions / (interruptions + completions)
  avgSpeakingRate: number
}

function sttConfigForFormat(formato: string): typeof FORMAT_STT_CONFIG[string]
function suggestedMaxFrases(rhythm: CallRhythm, currentMax: number): number
function formatForInterruptionLevel(count: number, currentFormat: string): string | null
function classifyUtterance(text: string): 'closing_question' | 'challenge' | 'story' | 'data' | 'discovery_question' | 'statement'
function utteranceVoiceOverlay(base: VoiceProfile, utteranceType: string): VoiceProfile
```

**Reglas `suggestedMaxFrases`:**
- `interruptionRate > 0.40` → 1 frase
- `avgProspectWords < 6` → min(currentMax, 2)
- `avgProspectWords > 30` → min(currentMax + 1, 4)
- resto → sin cambio

**Reglas `formatForInterruptionLevel`:**
- `< 2` interrupciones → null (sin cambio)
- `2-3` (y formato actual no era breve) → `'directo'`
- `4+` → `'snap'`

---

### 7.13 `compliance.ts`

```typescript
// Timezones por LADA México
const LADA_TIMEZONE: Record<string, string> = {
  '55': 'America/Mexico_City',
  '33': 'America/Mexico_City',
  '81': 'America/Monterrey',
  '664': 'America/Tijuana',
  '686': 'America/Hermosillo',
}

const OPTOUT_PHRASES = [
  'no me llamen', 'no me vuelvan a llamar', 'quiten mi número',
  'no me contacten', 'bórrenme', 'elimínenme', 'no quiero que me llamen',
]

function withinLegalHours(phone?: string, now?: Date): boolean
function detectOptout(text: string): boolean
function canCall(phone: string): Promise<{ allowed: boolean; reason: string }>
function registerOptout(phone: string, reason?: string): Promise<void>
function disclosureLine(agentName?: string): string
function mustGetRecordingConsent(): string
```

---

### 7.14 `agentConfig.ts`

```typescript
interface AgentConfig {
  softwareId: string
  activo: boolean
  identity: {
    agentName: string
    agentGender: 'male' | 'female' | 'neutral'
    agentAccent: string
  }
  product: {
    companyName: string
    productName: string
    targetVertical: string
    priceMonthly: number
    currency: string
    currencySymbol: string
    marketCountry: string
  }
  playbook: {
    strategy: string
    scripts: Record<string, string | string[]>
  }
  compliance: {
    disclosureText: string
    disclosureAi: boolean
    timezone: string
    callHourStart: number
    callHourEnd: number
  }
  voice: {
    twilioFromNumber?: string
    elevenLabsVoiceId?: string
    twilioName?: string
  }
}

// Cache en memoria con TTL 5 min
// Orden: Map<softwareId, {ts, config}> → Prisma Agent → default
async function loadAgentConfig(agentId: string): Promise<AgentConfig>
function defaultAgentConfig(): AgentConfig
```

---

### 7.15 `telephony/twilioClient.ts`

```typescript
import twilio from 'twilio'

function buildStreamTwiml(params: Record<string, string>): string
  // TwiML con <Connect><Stream url="wss://host/media"><Parameter .../></Stream></Connect>

function startOutboundCall(params: {
  toNumber: string
  businessType?: string
  businessName?: string
  orgId: string
  campaignId: string
  agentId: string
  leadId: string
}): Promise<{ status: string; sid?: string; to: string }>

function transferCall(callSid: string, toNumber: string): Promise<void>

function selectCallerId(toNumber: string): string
  // Estrategia static | dynamic (por LADA)
```

---

### 7.16 `pipelines/deepgramElevenLabs.ts`

Orquesta todos los módulos. Es el equivalente del pipeline principal.

```typescript
type AudioSender = (audio: Buffer) => Promise<void>
type InterruptCallback = () => Promise<void>
type TranscriptCallback = (role: string, text: string) => Promise<void>

class DeepgramElevenLabsSession {
  constructor(ctx: CallContext, systemPrompt: string)

  // Llamados desde mediaStream.ts
  attach(onAudio: AudioSender, onInterrupt?: InterruptCallback, onTranscript?: TranscriptCallback): Promise<void>
  sendAudio(pcm16k: Buffer): Promise<void>
  updateEotTimeout(ms: number): Promise<void>
  run(): Promise<void>   // lanza STT, TTS, LLM
  close(): Promise<void>
}
```

**Estado interno:**
```typescript
private _stt: DeepgramSTT | null
private _tts: ElevenLabsTTS | null
private _llm: FastExecutor | null
private _guru: GuruSupervisor | null
private _currentBrief: GuruBrief
private _prosodic: ProsodicBuffer
private _lastAcoustic: AcousticState | null
private _turnCount: number
private _agentResponses: string[]   // últimas 5 para loop detection
private _neutralTurns: number
private _triedEstructuras: string[]
private _rhythm: CallRhythm
private _agentTurnActive: boolean
private _speculativeTask: Promise<string> | null
```

---

### 7.17 `telephony/mediaStream.ts`

Registrado como WebSocket en Fastify (`/media`). Equivale a `handle_media_stream`.

```typescript
// En index.ts:
app.register(require('@fastify/websocket'))
app.get('/media', { websocket: true }, handleMediaStream)

async function handleMediaStream(connection: WebSocket): Promise<void>
  // Eventos Twilio: 'start', 'media', 'stop'
  // En 'start': leer customParameters (orgId, campaignId, agentId, leadId, ...)
  //             crear/reclamar DeepgramElevenLabsSession
  // En 'media': decodificar base64 → μ-law → PCM → session.sendAudio()
  // En 'stop':  cerrar sesión
  // En finally: ingestar llamada a Prisma via ingestCall()
```

**TwiML WebSocket URL:** `wss://{PUBLIC_HOST}/media`

---

## 8. Contratos de API Twilio

### Inbound call webhook `POST /voice`

Twilio envía `application/x-www-form-urlencoded`. Requiere `@fastify/formbody`.

**Body recibido:**
```
CallSid=CA...&To=+52155...&From=+52155...&Direction=inbound
```

**Response esperado:** TwiML XML
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://tu-host/media">
      <Parameter name="orgId" value="clyyyyyy" />
      <Parameter name="leadId" value="lead_abc" />
      <Parameter name="agentId" value="agent_xyz" />
      <Parameter name="campaignId" value="camp_123" />
      <Parameter name="phone" value="+52155XXXXXXXX" />
    </Stream>
  </Connect>
</Response>
```

### Media Streams WebSocket `/media`

Twilio abre WebSocket y envía mensajes JSON:

```jsonc
// Evento start (metadatos)
{ "event": "start", "start": { "callSid": "CA...", "streamSid": "MZ...", "customParameters": { "orgId": "...", ... } } }

// Evento media (audio μ-law base64)
{ "event": "media", "media": { "payload": "base64encodedUlaw..." } }

// Evento stop (fin de llamada)
{ "event": "stop" }
```

Hacia Twilio:
```jsonc
// Audio de vuelta
{ "event": "media", "streamSid": "MZ...", "media": { "payload": "base64encodedUlaw..." } }

// Barge-in: vaciar audio en reproducción
{ "event": "clear", "streamSid": "MZ..." }
```

---

## 9. Flujo completo de una llamada

```
1. Campaign dispatch (BullMQ) → POST /campaigns/start
         ↓
2. /campaigns/start → startOutboundCall() → Twilio REST API
         ↓
3. Twilio llama al prospecto → cuando contesta: POST /voice
         ↓
4. /voice handler:
   - Busca Lead en Prisma por phone
   - Carga AgentConfig (cache → Prisma → default)
   - Construye TwiML con customParameters
   - Response XML → Twilio abre WebSocket /media
         ↓
5. WebSocket /media → handleMediaStream():
   - evento 'start': crea CallContext + DeepgramElevenLabsSession
   - session.run(): inicializa STT, TTS, LLM, Guru
         ↓
6. Audio loop (durante la llamada):
   Twilio → μ-law → bridge.twilioToGemini() → PCM16
   PCM16 → dsp.preprocessInbound() → DSP clean
   PCM16 → session.sendAudio()
         ↓
7. Deepgram STT (5 eventos):
   StartOfTurn → registra interrupción si agente hablaba
   EagerEndOfTurn → dispara LLM especulativo (task)
   TurnResumed → cancela LLM especulativo
   EndOfTurn → análisis prosódico, trigger Guru, LLM final
         ↓
8. LLM (Cerebras):
   - Lee GuruBrief actual
   - Genera respuesta (max_tokens=200, ~35ms TTFT)
   - classify_utterance() → voice overlay temporal
         ↓
9. ElevenLabs TTS:
   - preprocess_text() → inyecta pausas naturales
   - POST streaming → PCM24k
   - bridge.geminiToTwilioFrames() → μ-law frames
   - Twilio reproduce
         ↓
10. Guru (cada N turnos, en background):
    - GuruSupervisor.analyzeAndBrief() → Claude
    - Si formato cambia: TTS.setVoiceProfile() + STT.configure()
         ↓
11. Fin de llamada (evento 'stop'):
    - session.close()
    - Mapear outcome → Prisma enum
    - ingestCall() → tabla Call en Prisma
    - emitToOrg(orgId, 'call:completed', call) → Socket.io frontend
```

---

## 10. Checklist de implementación

### Fase 1 — Audio + Twilio
- [ ] `npm install twilio @fastify/websocket @fastify/formbody` en backend
- [ ] `voice/audio/bridge.ts` — tabla μ-law G.711, resampling, frameo
- [ ] `voice/audio/dsp.ts` — rmsLevel, noiseGate, autoGain, preprocessInbound
- [ ] `voice/telephony/twilioClient.ts` — buildStreamTwiml, startOutboundCall, transferCall
- [ ] `voice/telephony/mediaStream.ts` — handleMediaStream (esqueleto, sin IA)
- [ ] Registrar en `index.ts`: `POST /voice`, `GET /media` (websocket), `POST /outbound`, `POST /campaigns/start`
- [ ] Test: llamada entra, audio bidireccional fluye (silencio de vuelta)

### Fase 2 — STT + TTS
- [ ] `npm install @deepgram/sdk elevenlabs` en backend
- [ ] `voice/stt/deepgram.ts` — DeepgramSTT, 5 eventos Flux v2
- [ ] `voice/tts/voiceProfiles.ts` — 11 perfiles + applyModifiers + preprocessText
- [ ] `voice/tts/elevenLabsTts.ts` — streaming HTTP + buffer 200 chars
- [ ] `voice/audio/noiseClassifier.ts`
- [ ] `voice/audio/prosodic.ts` — ProsodicBuffer, AcousticState
- [ ] Test: prospecto habla → transcripción → TTS responde "hola" hardcodeado

### Fase 3 — LLM + Estado
- [ ] `npm install openai @anthropic-ai/sdk` en backend
- [ ] `voice/intelligence/conversation/callContext.ts`
- [ ] `voice/intelligence/llm/cerebras.ts` — OpenAI client apuntando a Cerebras
- [ ] `voice/intelligence/conversation/guruBrief.ts` — GuruBrief + VALID_ESTRUCTURAS
- [ ] `voice/intelligence/conversation/fastExecutor.ts`
- [ ] `voice/coordinator.ts` — CallRhythm + FORMAT_STT_CONFIG + classify_utterance
- [ ] `voice/agentConfig.ts` — loader + AgentConfig
- [ ] `voice/pipelines/deepgramElevenLabs.ts` — pipeline completo (sin Guru)
- [ ] Test: conversación real completa con Cerebras

### Fase 4 — Guru
- [ ] `voice/intelligence/conversation/guruSupervisor.ts` — Claude + OBJECTION_PLAYBOOK
- [ ] Activar `DUAL_MODEL_ENABLED` en pipeline
- [ ] Test: objeción detectada → Guru cambia estrategia → voice profile cambia

### Fase 5 — Compliance + Producción
- [ ] `voice/compliance.ts` — horario legal, opt-out
- [ ] `npm install @google/genai` — fallback Gemini
- [ ] `voice/intelligence/llm/gemini.ts`
- [ ] Integrar compliance en `/outbound` y `/campaigns/start`
- [ ] Test end-to-end: campaña → llamadas → resultados en CRM frontend
- [ ] Verificar Socket.io: `call:completed` llega al frontend en tiempo real
