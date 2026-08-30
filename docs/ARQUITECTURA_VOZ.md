# Arquitectura de voz

Actualizado: 11 de agosto de 2026. Sustituye a toda la documentación de voz
anterior (motor autoalojado, Deepgram, ElevenLabs, Qwen Omni, Chatterbox,
Kyutai, modular vs duplex), borrada junto con su código el 10/08/2026.

**Un solo pipeline, un solo idioma:**

```
micrófono / teléfono → PCM16 16 kHz
   → Cartesia Ink-2        (STT + detección semántica de turno)
   → Cerebras gpt-oss-120b (LLM, streaming)
   → MiniMax Speech 2.8    (TTS, PCM16 24 kHz)
   → auricular / teléfono
```

Objetivo de latencia: **650 ms** desde que el interlocutor deja de hablar hasta
que suena el primer audio del agente.

---

## 1. Dónde vive

| Pieza | Fichero |
|---|---|
| Motor de turnos completo | [backend/src/voice/pipelines/vendravaVoice.ts](../backend/src/voice/pipelines/vendravaVoice.ts) |
| Tipos y eventos de la cabina | [backend/src/voice/pipelines/vendravaProtocol.ts](../backend/src/voice/pipelines/vendravaProtocol.ts) |
| STT (WebSocket Cartesia) | [backend/src/voice/stt/cartesiaInk.ts](../backend/src/voice/stt/cartesiaInk.ts) |
| LLM (SSE Cerebras) | [backend/src/voice/intelligence/llm/cerebrasStream.ts](../backend/src/voice/intelligence/llm/cerebrasStream.ts) |
| TTS (WebSocket MiniMax) | [backend/src/voice/tts/minimaxTts.ts](../backend/src/voice/tts/minimaxTts.ts) |
| Estratega fuera del camino crítico | [backend/src/voice/intelligence/conversation/vendravaGuru.ts](../backend/src/voice/intelligence/conversation/vendravaGuru.ts) |
| Emoción derivada del audio | [backend/src/voice/utils/prosody.ts](../backend/src/voice/utils/prosody.ts) |
| Troceo en frases hablables | [backend/src/voice/utils/speechChunker.ts](../backend/src/voice/utils/speechChunker.ts) |
| Contrato con telefonía y simulador | [backend/src/voice/engine/voiceSession.ts](../backend/src/voice/engine/voiceSession.ts) |
| Fábrica de sesiones | [backend/src/voice/engine/factory.ts](../backend/src/voice/engine/factory.ts) |
| Telefonía Twilio | [backend/src/voice/telephony/mediaStream.ts](../backend/src/voice/telephony/mediaStream.ts) |
| Cabina de navegador (servidor) | [backend/src/voice/telephony/simStream.ts](../backend/src/voice/telephony/simStream.ts) |
| Cabina de navegador (interfaz) | [src/pages/VoiceCabinPage.jsx](../src/pages/VoiceCabinPage.jsx) |

El origen es el prototipo `vendrava-voice-lab`, portado al CRM y borrado después.

---

## 2. Formatos de audio

El pipeline se eligió para encajar sin conversiones extra en lo que ya existía:

- **Entrada**: PCM16 mono **16 kHz**, que es lo que ya entregaban tanto
  `AudioBridge.twilioToGemini` (μ-law 8 kHz → 16 kHz) como el navegador.
- **Salida**: PCM16 mono **24 kHz**, que es lo que ya esperaban
  `AudioBridge.geminiToTwilioFrames` (24 kHz → μ-law 8 kHz) y el reproductor del
  simulador. MiniMax puede emitir 44,1 kHz, pero se le pide 24 kHz para no
  añadir un resampler en las dos puntas.

---

## 3. Anatomía de un turno

1. **`turn.start`** de Ink-2: el interlocutor empieza a hablar. Se corta el audio
   del agente (barge-in), se avisa a telefonía para que vacíe la cola de Twilio y
   se **precalienta** el WebSocket de MiniMax mientras el usuario sigue hablando.
2. **`turn.update`**: transcripción parcial, se emite como `partial` al CRM.
3. **`turn.eager_end`**: Ink-2 cree que el turno ha acabado. Con especulación
   activa se lanza **ya** el LLM y el TTS. El audio resultante se guarda en
   memoria, no se reproduce.
4. **`turn.resume`**: era una pausa, no un final. Se aborta el LLM y el TTS y se
   tira el audio especulativo.
5. **`turn.end`**: turno confirmado. Si el texto final coincide con el que se
   especuló, se **compromete** la generación y se suelta el audio ya sintetizado
   — de ahí los ~200 ms de ventaja. Si no coincide, se cancela y se empieza de nuevo.
6. Cerebras responde en streaming. `SpeechChunker` corta la respuesta en frases:
   **la primera muy corta** para bajar el tiempo hasta el primer audio, las
   siguientes más largas para que MiniMax conserve la prosodia.
7. Al terminar de hablar, se lanza el **guru** en el hueco muerto.

### Barge-in

Lo decide **solo Ink-2**, por semántica de turno. El detector por energía (RMS)
que había antes se retiró el 11/08/2026: disparaba con toses y ruido de fondo.
Gana en falsos positivos, pierde unos milisegundos de reacción.
Si hiciera falta recuperarlo, el sitio es `checkBargeIn` en `mediaStream.ts`.

---

## 4. Las dos capas de lectura de la conversación

Ninguna está en el camino crítico del turno, así que no tocan los 650 ms.

**Emoción (`utils/prosody.ts`).** No hay un segundo STT ni proveedor externo: la
señal se deriva de lo que el servidor ya recibe — el PCM de 16 kHz y los
timestamps de turno — y produce energía, palabras por minuto, tiempo de duda
antes de responder y número de interrupciones. Coste cero, latencia cero. El
tipo `EmotionReading` lleva un campo `source` para que un modelo real de
prosodia (Hume) lo sustituya sin tocar nada aguas abajo.

**Guru (`vendravaGuru.ts`).** Una segunda pasada por Cerebras que decide la
estrategia: qué dejar de vender, qué preguntar, cuándo parar. Corre **mientras el
agente habla** (3 a 8 segundos de reloj) y deja una directiva de una línea que se
inyecta en el turno *siguiente*. Medido en el laboratorio: ~830 ms. Si tarda de
más o falla, sigue vigente la directiva anterior; el guru nunca puede tumbar la
llamada.

Emoción y directiva se inyectan como **un único mensaje de sistema por llamada al
LLM y nunca se guardan en el historial**: si se guardaran, cada turno arrastraría
el coaching viejo de todos los anteriores.

---

## 4bis. Tipos de agente: entrante y saliente

`Agent.agentType` y `Agent.callDirection` existían desde el principio pero eran
decorativos: un recepcionista que atiende y un comercial que llama en frío
usaban el mismo saludo y el mismo objetivo. Desde el 12/08/2026 el catálogo de
[agentPlaybooks.ts](../backend/src/voice/agentPlaybooks.ts) los hace distintos.

| Tipo | Dirección | Qué hace distinto |
|---|---|---|
| Comercial | saliente | Descubre antes de vender, cierra con día y hora |
| Recepción | entrante | No vende: identifica y transfiere en cuanto hace falta una persona |
| Calificación | ambas | Comprueba encaje y admite cuando no lo hay, en vez de forzar reunión |
| Agenda | ambas | Confirma o reprograma en menos de un minuto, con dos alternativas concretas |
| Soporte | entrante | Solo responde con la base de conocimiento; si no está, escala |
| Recobro | saliente | Verifica identidad antes de hablar de dinero y **nunca** transfiere |
| Filtro | entrante | Dos preguntas y pasa con una persona |

Cada playbook aporta objetivo, fases, política de transferencia, si puede
agendar y cuántos turnos debería durar la llamada. Todo eso se inyecta en el
prompt por `buildIntelligentPrompt`.

**La dirección real de la llamada ya llega al motor.** El webhook de entrante
mandaba `direction: 'inbound'` desde siempre, pero se perdía en
`buildStreamTwiml`: el motor trataba una llamada recibida como si la hubiéramos
hecho nosotros. Ahora viaja firmada dentro de la capacidad de Media Stream
(`MediaStreamClaims.direction`), porque decide el saludo y no puede ser un
parámetro que Twilio transporte en claro.

---

## 5. Compliance

El motor no decide nada de compliance por su cuenta; obedece a telefonía.

- **Saludo**: el del laboratorio más lo que exige la ley — disclosure de IA
  (salvo `DISCLOSE_AI=false`) y pregunta de consentimiento de grabación si está
  pendiente. Ver `greeting()` en `vendravaVoice.ts`.
- **Veto**: `stopResponding(reason)` corta el turno en curso y bloquea cualquier
  generación posterior en esa llamada. Lo invoca `mediaStream.ts` al detectar
  opt-out o transferencia. Sustituye al antiguo aparato de directivas por turno.
- Opt-out, horarios legales, transferencia a humano y consentimiento siguen en
  [backend/src/voice/compliance.ts](../backend/src/voice/compliance.ts) y en
  `mediaStream.ts`, fuera del motor.

---

## 6. Telemetría

Cada evento del pipeline (`stt.event`, `latency.update`, `turn.metrics`, `trace`,
`emotion.update`, `guru.update`, `provider.status`…) sale como `VoiceSessionEvent`
por el mismo canal que ya usaban los motores anteriores. Eso significa que:

- El `SessionLogger` los escribe a disco por sesión.
- `VoiceTrace` los persiste en `VoiceCallEvent` y `VoiceCallMetric`, y guarda un
  `runtimeSnapshot` fijo del stack en la fila de `Call`.
- La cabina los recibe tal cual dentro de `{type:'voice_event', event}` y pinta
  con ellos el timeline, el P50/P95 y la salud de audio, sin protocolo aparte.

---

## 7. La cabina `/voz/cabina`

Puerto directo de la interfaz del laboratorio: KPIs, timeline de las cuatro
etapas con timestamps del servidor, gráfico de los últimos ocho turnos contra el
objetivo de 650 ms, salud de audio, y controles de silenciar micro, silenciar
salida, interrumpir y colgar. Habla por el WebSocket `/voice-sim/live`, el mismo
que ya usaban las páginas de prueba anteriores, autenticado por JWT en el
subprotocolo.

El botón **Run demo** simula un turno con la voz del sistema operativo, sin tocar
proveedores: sirve para verificar la interfaz sin gastar API.

Los ajustes (voz clonada, modelo turbo/HD, velocidad, especulación) viajan en el
mensaje `start` y se aplican a la sesión que arranca.

---

## 8. Variables de entorno

```dotenv
CARTESIA_API_KEY=          # obligatoria
CARTESIA_VERSION=2026-03-01
CEREBRAS_API_KEY=          # obligatoria
CEREBRAS_MODEL=gpt-oss-120b
MINIMAX_API_KEY=           # obligatoria
MINIMAX_VOICE_ID=English_expressive_narrator
```

Sin las tres claves, `vendravaVoiceConfigured()` devuelve `false`: la telefonía
lanza error al crear la sesión y la cabina responde con un mensaje explícito.

---

## 9. Límites conocidos

1. **Solo inglés, por decisión de producto (11/08/2026).** El endpoint de turnos
   automáticos de Ink-2 no acepta otro idioma, y se decidió no sustituirlo. Todo
   el andamiaje está alineado: prompt, guion de respaldo, idioma por defecto del
   agente, disclosure y frases de AMD. **Un agente configurado en otro idioma no
   llama**: `vendravaVoiceLanguageSupported` lo corta en el factory, en el
   simulador y en el propio motor, con un motivo legible.
2. **El guion sí viene del CRM.** El agente, su playbook y el contexto del lead
   se componen en `buildIntelligentPrompt` y las reglas de voz se añaden al
   final para que ganen al formato pensado para texto. Solo cuando la llamada no
   trae agente se usa la persona de respaldo del laboratorio.
3. **`liveCalls` es un Map en memoria de un solo proceso.** Con más de una
   instancia de backend, el widget "En directo" solo ve sus propias llamadas.
4. **Coste dominado por el TTS**: MiniMax es ~91 % del coste de IA por llamada.
   Ver [COSTES_VOZ_INGLES.md](../COSTES_VOZ_INGLES.md).
5. **Nunca se ha ejecutado contra los tres proveedores a la vez** en este repo:
   los contratos de WebSocket y SSE están implementados contra la documentación
   oficial y verificados con tests unitarios, no con una llamada real.
