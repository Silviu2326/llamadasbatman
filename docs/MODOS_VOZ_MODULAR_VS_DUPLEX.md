# Los dos modos de voz: Modular vs Duplex

Fecha: 2026-07-27 · Revisión previa al test de 8 h en RunPod (ver `PLAN_TEST_RUNPOD_8H.md`).

Los dos modos comparten el mismo contrato WebSocket con el backend Node (eventos `session.start` → `session.ready`, `audio.in`/`assistant.audio` en PCM16, definido en `VOZ_OPEN_SOURCE_FULL_DUPLEX.md` y validado por `voiceEngineProtocol.test.ts`). Node siempre es la autoridad de tenant, compliance, permisos y persistencia: los workers de GPU solo hacen inferencia. Cambiar de modo no toca el pod — es `.\scripts\voice-arch.ps1 modular|duplex` + reinicio del backend (~30 s).

```text
Navegador /voz/test (micro) ──► Node local (Fastify) ──ssh -L──► Pod RunPod L40S
   WebSocket /voice-sim/live         │                             ├─ server.py        :9100  MODULAR
                                     │ selección por               └─ moshi_gateway.py :9200  DUPLEX
                                     │ VOICE_ENGINE_ARCHITECTURE
```

## Modo 1 — Vendrava Voice Modular (`server.py`, :9100)

**Qué es:** la cascada clásica STT → LLM → TTS con piezas open source intercambiables. Es el **modo destinado a producción** (y la vía para español).

| Etapa | Modelo | Detalle |
|---|---|---|
| STT | `faster-whisper large-v3-turbo` | Transcribe el turno acumulado; parciales sobre snapshots del buffer |
| Fin de turno | VAD por energía + timeout (`VOICE_ENGINE_EOT_MS`, 700 ms) | Smart Turn v3 opcional como clasificador semántico (`VOICE_ENGINE_SMART_TURN_ENABLED`) |
| LLM | Qwen3-8B servido por vLLM (API OpenAI-compatible) | Recibe el `systemPrompt` comercial del agente — **sí sigue el guion de negocio** |
| TTS | Piper (voz `.onnx` por idioma) | Alternativas opcionales vía `VOICE_ENGINE_TTS_PROVIDER`: Qwen3-TTS o Chatterbox multilingüe, ambas con fallback automático a Piper |

**Flujo de un turno:** el audio del cliente entra en PCM16 16 kHz → VAD detecta que habla → al callar, whisper transcribe → Qwen3 genera la respuesta con el prompt del agente → Piper la sintetiza por frases a 24 kHz → si el cliente interrumpe (barge-in), la respuesta activa se cancela.

- **Fortalezas:** obedece el `systemPrompt` (guion, opt-out, transferencia), idioma configurable por sesión (es-ES/en-US), cada pieza se puede sustituir o escalar por separado, VRAM contenida (~12–16 GB).
- **Límites:** latencia = suma de las tres etapas (el turno se procesa al terminar, no en streaming nativo); la voz sale por frases, no es speech-to-speech.

## Modo 2 — Vendrava Duplex (`moshi_gateway.py`, :9200)

**Qué es:** speech-to-speech **full dúplex** con Moshi/Mimi de Kyutai (`kyutai/moshiko-pytorch-bf16`). No hay cascada: un solo modelo escucha y habla a la vez, puede solaparse con el cliente y reaccionar en mitad de una frase. Es el **canario de naturalidad**, nativo en inglés.

| Pieza | Modelo | Papel |
|---|---|---|
| Speech-to-speech | Moshi bf16 (~16–20 GB VRAM) | Genera audio de respuesta en continuo, gestiona solapamiento e interrupciones |
| Códec de audio | Mimi | Tokeniza/detokeniza el audio para Moshi |
| STT paralelo | `faster-whisper large-v3-turbo` | "Tap" de transcripción para logs, compliance y trazabilidad en Node — no está en el camino del audio |

**Flujo:** el audio entra en continuo → Moshi responde también en continuo (sin esperar fin de turno) → el whisper paralelo transcribe lo dicho para que Node vigile opt-out/compliance y persista la conversación.

- **Fortalezas:** la latencia percibida y la naturalidad conversacional (interrupciones, solapamiento, back-channels) que una cascada no puede igualar.
- **Límites (por qué es canario y no producción):** el checkpoint base **no aplica el `systemPrompt` comercial** — se evalúa naturalidad, no guion de negocio; nativo en inglés; una sola sesión por GPU; `smoke_duplex.py` valida el camino completo antes de abrir el simulador.

## Estado de la revisión (27/07)

Verificado hoy en el repo, todo consistente con el plan de mañana:

- **Contrato y selección de modo:** los 5 suites de voz del backend pasan (12/12) — protocolo de eventos, factoría por `VOICE_ENGINE_ARCHITECTURE`, anuncio de arquitectura/idioma al gateway, turn manager y escenarios. `remoteVoiceArchitecture.test.ts` dependía de tener el bloque `VOICE_*` descomentado en `.env`; corregido para que fije sus propias envs.
- **Workers Python:** `server.py`, `moshi_gateway.py`, `smoke_duplex.py` y `test_moshi_gateway.py` compilan (`py_compile`). Los nombres de env y puertos del plan coinciden con el código (`VOICE_ENGINE_*` :9100, `VOICE_DUPLEX_*` :9200, endpoint `/ws`, auth `Bearer`).
- **Bootstrap:** `runpod_bootstrap.sh` descarga exactamente lo que ambos modos necesitan (Moshi, Qwen3-8B, whisper, voces Piper es-ES y en_US) y es idempotente sobre el volumen.
- **Idioma:** Node lo envía por sesión en el `session.start` (`VOICE_CALL_LANGUAGE` para modular, `VOICE_DUPLEX_LANGUAGE` para duplex, con el acento del agente por delante). El `export VOICE_CALL_LANGUAGE` en el pod que aparece en el plan es redundante (el sidecar lee `VOICE_ENGINE_LANGUAGE` como fallback) pero inofensivo.
- **Simulador:** la ruta `/voice-sim/live` y la página `/voz/test` existen; `VOICE_SIM_MAX_DURATION_SECONDS` admite justo hasta 3600 s, el valor del plan.

Nota operativa: `python smoke_duplex.py` necesita `VOICE_DUPLEX_ENGINE_TOKEN` exportado en la shell donde se ejecute (tercera terminal, o la misma del gateway si este corre en background).

## Optimizaciones "venta real" (aplicadas 27/07)

- **El agente abre la llamada**: Node construye la apertura (disclosure de IA + presentación con nombre de agente y empresa + consentimiento de grabación si la política lo pide) con el mismo helper que la ruta legacy (`openingGreeting` en `compliance.ts`) y la envía en `session.start`; el sidecar modular la habla nada más arrancar y la registra en historia y transcript. Antes la ruta OSS empezaba con el agente en silencio y sin disclosure. Duplex la ignora (Moshi no reproduce guion).
- **LLM tunable en vivo**: `VOICE_ENGINE_LLM_MAX_TOKENS` (def. 160) y `VOICE_ENGINE_LLM_TEMPERATURE` (def. 0.55) — antes hardcodeados.
- **Bootstrap con extras opcionales** (best-effort, no rompen si fallan): pesos de Qwen3-TTS para el A/B de prosodia contra Piper y Smart Turn v3 (`pipecat-ai/smart-turn-v3`) para fin de turno semántico.
- **Palancas Duplex** (sin cambios de código, ya existían): `VOICE_DUPLEX_TEMPERATURE`/`VOICE_DUPLEX_TEXT_TEMPERATURE` para que divague menos; checkpoint fusionado Moshi-Call-EN vía `VOICE_DUPLEX_MOSHI_WEIGHT`/`MIMI_WEIGHT` como vía futura a agente de negocio.
- **Realismo opcional (`ambience.py`, apagado por defecto)**: muletillas pre-sintetizadas que el sidecar suelta mientras el LLM piensa (solo tras intervenciones ≥3 s del prospecto, rotadas para no sonar a loop) y ruido de línea telefónica mezclado sobre la voz del agente en ambos modos. El ruido suena solo mientras habla el agente (ambiente continuo exigiría mezclar pistas en el cliente) y el STT paralelo de Duplex transcribe el audio limpio.

## Las 4 versiones del A/B

Las dos "arriesgadas" son los mismos workers con flags de realismo: activar una versión es exportar sus envs y reiniciar solo ese worker en el pod (~10 s). Node no cambia (V3 es modular, V4 es duplex).

| Versión | Worker | Envs |
|---|---|---|
| **V1 Modular base** | `server.py` | — (flags de realismo apagados) |
| **V2 Duplex base** | `moshi_gateway.py` | — |
| **V3 Modular realista** | `server.py` | `VOICE_ENGINE_BACKCHANNEL=true` · `VOICE_ENGINE_AMBIENCE_LEVEL=0.004` · sugerido `VOICE_ENGINE_LLM_MAX_TOKENS=120` |
| **V4 Duplex realista** | `moshi_gateway.py` | `VOICE_DUPLEX_AMBIENCE_LEVEL=0.004` · `VOICE_DUPLEX_TEMPERATURE=0.6` · `VOICE_DUPLEX_TEXT_TEMPERATURE=0.5` |
| **V5 Modular Chatterbox** | `server.py` | `VOICE_ENGINE_TTS_PROVIDER=chatterbox` (realismo apagado) |
| **V6 Modular Chatterbox realista** | `server.py` | lo de V5 + los flags de V3 |

Chatterbox (Resemble AI, MIT) solo aplica al modo modular — Duplex no tiene slot de TTS, Moshi genera el audio directamente. Es el candidato a mejor voz OSS (ganó blind tests de preferencia contra ElevenLabs; checkpoint multilingüe con español). Palancas: `VOICE_ENGINE_CHATTERBOX_EXAGGERATION` (0–1, def. 0.5, más = más expresivo), `VOICE_ENGINE_CHATTERBOX_CFG_WEIGHT` (def. 0.5, bajar ≈ habla más pausada) y `VOICE_ENGINE_CHATTERBOX_VOICE=<wav de referencia>` para clonar un timbre concreto. Qué vigilar en V5/V6: latencia por frase contra Piper (modelo 0.5B autoregresivo — apuntar P50/P95; si la voz sube pero el ritmo se arrastra, pierde) y VRAM (~4–6 GB extra).

Qué evaluar en V3/V4 frente a su base: ¿la muletilla enmascara la espera del LLM o suena postiza? ¿el ruido de línea aporta "llamada real" o ensucia? ¿el Duplex menos caliente divaga menos sin perder naturalidad? `VOICE_ENGINE_AMBIENCE_LEVEL`/`VOICE_DUPLEX_AMBIENCE_LEVEL` admiten 0–0.05 (0.004 ≈ apenas audible; subir a 0.01 si no se percibe).

## Hipótesis pre-test: las 4 versiones contra un humano

Estimaciones a 27/07, **sin GPU — validarlas mañana**. Hay dos rankings y se invierten:

**Naturalidad de la voz** (MOS 1–5 estimado): Humano 5.0 › ElevenLabs ~4.5 (legacy, bloqueada por política OSS) › Moshi ~4.0 (prosodia real, a veces balbucea) › Qwen3-TTS ~3.5–4.0 › Piper medium ~3.0 (estable pero plana, se nota sintética).

**Eficacia como llamada de venta**: Comercial senior › Teleoperador medio › **V3 Modular realista** › V1 Modular base › Teleoperador quemado que recita › **V4/V2 Duplex** (el más natural conversando y el peor vendiendo: no obedece guion). La frontera a vigilar es V3 vs teleoperador desmotivado — consistencia del bot contra timbre humano.

Claves de interpretación:
- La llamada declara que es IA (disclosure), así que el listón real no es "pasar por humano" sino "sabiendo que es IA, resultar agradable y eficaz".
- Lo que más delata al bot no es el timbre sino el **ritmo**: pausa fija antes de responder y cortes en pausas de pensamiento. Smart Turn y los backchannels de V3 pueden mover la percepción más que cambiar de TTS.
- Medición mañana, sin montar nada: en cada sesión de la comparación de las 21:00, puntuar 1–5 tres columnas — voz, ritmo, "¿le compraría?" — junto a las P50/P95. Ese ranking real sustituye a esta sección.
- Escalera de mejora de voz: A/B `VOICE_ENGINE_TTS_PROVIDER=qwen3` y `=chatterbox` (mañana, ambos ya integrados) → ElevenLabs solo si se relaja la política de propietarios. Chatterbox estimado ~4.2–4.5 MOS, el peldaño OSS más alto disponible.

## Chuleta de arranque

```bash
# Pod — Modular (:9100)
export VOICE_ENGINE_TOKEN=<secreto-1> VOICE_ENGINE_ARCHITECTURE=modular \
       VOICE_ENGINE_PIPER_MODEL=/workspace/models/en_US-lessac-medium.onnx \
       VOICE_ENGINE_LLM_BASE_URL=http://127.0.0.1:8000/v1 VOICE_ENGINE_LLM_MODEL=Qwen/Qwen3-8B
python server.py

# Pod — Duplex (:9200)
export VOICE_DUPLEX_ENGINE_TOKEN=<secreto-2> VOICE_DUPLEX_MOSHI_REPO=kyutai/moshiko-pytorch-bf16 \
       VOICE_DUPLEX_MOSHI_DEVICE=cuda VOICE_DUPLEX_STT_MODEL=large-v3-turbo
python moshi_gateway.py
```

```powershell
# Local — cambiar de modo entre sesiones
.\scripts\voice-arch.ps1 modular   # o duplex; reiniciar backend después
```

Horarios, coste, checklist de cierre y casos de prueba: `PLAN_TEST_RUNPOD_8H.md`.
