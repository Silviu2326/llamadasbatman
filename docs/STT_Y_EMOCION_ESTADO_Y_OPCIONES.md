# STT y detección de emoción — estado actual y opciones

Fecha: 2026-07-31

## 1. Qué hay hoy en el sistema

### Transcripción (STT)

| Dónde | Motor | Cuándo se usa |
|---|---|---|
| `voice-engine/server.py:106` | **faster-whisper** `large-v3-turbo` (`VOICE_ENGINE_STT_MODEL`) | Por turno en el engine self-hosted. Es el default (`VOICE_ENGINE_MODE=remote`). |
| `voice-engine/kyutai_stt.py` → WS `/stt` | **Kyutai `stt-1b-en_fr`** (streaming + VAD semántico) | Streaming real. Cliente Node: `backend/src/voice/stt/localKyutai.ts`, se activa con `STT_PROVIDER=kyutai`. |
| `backend/src/voice/stt/deepgram.ts` | **Deepgram Flux** `flux-general-multi`, idioma `es` | Pipeline legacy propietario. Sólo con `VOICE_ENGINE_MODE=legacy` **y** `VOICE_ENGINE_ALLOW_PROPRIETARY=true` (`backend/src/voice/engine/factory.ts:12`). |

Complementos: `voice-engine/moshi_gateway.py` (full-duplex Moshi: STT+LLM+TTS en un modelo) y `SmartTurnDetector` (ONNX, sólo fin de turno — no transcribe).

Inconsistencia de configuración a tener en cuenta: `backend/.env.example` declara
`STT_PROVIDER=deepgram` (línea 122) y `VOICE_STT_PROVIDER=faster-whisper` (línea 39).
El primero sólo aplica a la ruta legacy; el segundo es únicamente etiqueta de trazas
(`backend/src/voice/observability/voiceTrace.ts:53`).

### Tono / emoción

No hay modelo de emoción. Hay una heurística acústica: `ProsodicBuffer`
(`backend/src/voice/audio/prosodic.ts:23`) calcula RMS, ZCR, ratio de habla y
velocidad sobre el audio del turno, y devuelve un `AcousticState` con etiqueta
`agitado | energico | tenso | calmado | plano`.

Ese `turnAudio()` es el punto de integración natural para cualquier SER real:
mismo buffer PCM16 16 kHz, misma interfaz de salida.

## 2. Opciones evaluadas (julio 2026)

### Transcripción

| # | Motor | Por qué | Despliegue |
|---|---|---|---|
| 1 | **Deepgram Flux** (ya integrado) | EOT mediano <300 ms con fin de turno integrado; ahorra 200-600 ms frente a STT+VAD. Referencia para agentes de voz. | API, ~0,0077 $/min |
| 2 | **AssemblyAI Universal-3.5** | Mejor multilingüe medido: 4,9 % WER medio en de/fr/**es**/it/pt; 7,0 % agregado. La opción si el cuello de botella es precisión en español. | API |
| 3 | **NVIDIA Parakeet / Canary-Qwen (NeMo)** | Mejor self-hosted real: 5,63 % WER en inglés, licencia permisiva. Sustituto natural de faster-whisper `large-v3-turbo`, más lento y peor en streaming. | Self-host, 0 €/min |

Descartado: **Speechmatics Melia-1** lidera el agregado (6,4 % WER) y ofrece
on-prem, pero su propia guía recomienda ~1,5 s de latencia — no sirve para
tiempo real sin tuneo específico.

### Tono y emoción

| # | Motor | Por qué | Despliegue |
|---|---|---|---|
| 1 | **emotion2vec+ (large)** | SSL entrenado para ser independiente del idioma, validado en 10 idiomas. Corre sobre el PCM del turno que ya se acumula. Reemplazo directo de la heurística actual. | Self-host, HF, ~300 MB |
| 2 | **Hume AI — Speech Prosody / EVI** | 48 emociones + 600 descriptores vocales, streaming nativo. Lo más granular que existe, pero SaaS propietario: choca con `VOICE_ENGINE_ALLOW_PROPRIETARY=false`. | API, de pago |
| 3 | **Qwen3-Omni** | Audio-LLM: transcribe y razona sobre tono en una pasada, en español. Vía a futuro si se unifica STT+emoción en un modelo. | Self-host, GPU grande |

Descartado: **SenseVoice** aparece en todas las comparativas y es rapidísimo
(70 ms por 10 s de audio), pero su reconocimiento de emoción cubre mandarín,
cantonés, inglés, japonés y coreano — **no español**.

## 3. Recomendación

Un cambio cada vez, el barato primero:

1. **emotion2vec+ sobre `ProsodicBuffer.turnAudio()`**, manteniendo la interfaz
   `AcousticState`. Self-hosted, sin tocar el pipeline STT.
2. Si después el español sigue fallando en transcripción, evaluar AssemblyAI
   contra audio real de Twilio (8 kHz μ-law) antes de decidir. Los benchmarks
   publicados son de audio de estudio y no predicen telefonía.

## Fuentes

- [Best STT Providers 2026 — Coval (benchmarks independientes)](https://www.coval.ai/blog/best-speech-to-text-providers-in-2026-independent-benchmarks-and-how-to-choose/)
- [Deepgram vs Speechmatics vs AssemblyAI 2026](https://deepgram.com/learn/deepgram-vs-speechmatics-vs-assemblyai)
- [Best open source STT model 2026 — Northflank](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks)
- [emotion2vec (ACL 2024)](https://github.com/ddlBoJack/emotion2vec) · [emotion2vec_plus_large](https://huggingface.co/emotion2vec/emotion2vec_plus_large)
- [Hume — Speech Prosody Model](https://www.hume.ai/explore/speech-prosody-model)
- [SenseVoice](https://github.com/QwenAudio/SenseVoice)
- [Benchmark de modelos preentrenados para SER en español (MDPI)](https://www.mdpi.com/2076-3417/15/8/4340)
