# Latencia esperada en pod: Kyutai STT + Chatterbox TTS en la misma GPU

Estimación de la latencia de turno (el prospecto deja de hablar → el agente empieza a sonar)
juntando los dos servicios locales ya implementados en una máquina mejor que la 2080 SUPER.

- STT: `voice-engine` WS `/stt` — Kyutai `stt-1b-en_fr`, streaming real con VAD semántico (`STT_PROVIDER=kyutai`)
- TTS: `tts-chatterbox/server.py` — Chatterbox Turbo/Nano (`TTS_PROVIDER=chatterbox`)
- LLM: Cerebras (cloud) — no cambia con el pod

## Medido hoy en la 2080 SUPER (8GB, Turing)

| Componente | Valor medido |
|---|---|
| Kyutai STT, paso por frame de 80ms (estacionario) | 26ms media, 31ms p95 (3x tiempo real) |
| Kyutai STT, carga del modelo | 6.4s (+ ~7.5s de captura CUDA graphs en el primer frame, absorbido por el prefijo de silencio) |
| Chatterbox Turbo, por frase | ~2.4–2.7s |
| Chatterbox Nano, por frase | ~0.9–1.0s |
| SER wav2vec2 (`/ser`) | ~80ms |

## Estimación por GPU del pod (por frase de respuesta)

Escalado aproximado por potencia bruta y generación (Ada/Ampere tienen fp16/bf16 nativo
y mejor throughput por paso que Turing). Son **estimaciones**: medir en el pod con los
comandos de abajo antes de dar nada por bueno.

| GPU (VRAM) | STT paso/frame | Chatterbox Turbo | Chatterbox Nano |
|---|---|---|---|
| 2080 SUPER 8GB (hoy, medido) | 26ms | 2.4–2.7s | 0.9–1.0s |
| RTX 4090 / L40S 24–48GB | ~8–12ms | ~0.8–1.1s | ~0.3–0.45s |
| A100 80GB | ~7–10ms | ~0.7–1.0s | ~0.3–0.4s |

## Presupuesto de turno completo (fin de habla → primer audio del agente)

| Tramo | 2080 local (Nano) | Pod 4090 (Nano) | Pod 4090 (Turbo) |
|---|---|---|---|
| EOT: VAD semántico + flush (8 frames × paso) | ~250–400ms | ~200–300ms | ~200–300ms |
| LLM Cerebras (primer token, red incluida) | ~250–400ms | ~250–400ms | ~250–400ms |
| TTS primera frase | ~900–1000ms | ~300–450ms | ~800–1100ms |
| Red backend ↔ pod (2 saltos WS) | 0 | ~60–120ms | ~60–120ms |
| **Total estimado** | **~1.4–1.8s** | **~0.8–1.3s** | **~1.3–1.9s** |

Referencia: el pipeline propietario (Deepgram Flux + ElevenLabs Flash) ronda 0.7–1.2s de
total. Con un pod 4090 + Nano quedas en la misma liga con todo self-hosted; con Turbo
pagas ~0.5–0.8s más a cambio de más expresividad.

Notas del presupuesto:

- **El TTS domina.** Chatterbox sintetiza la frase completa antes de devolver audio (sin
  streaming por chunks). La palanca más barata: primera frase corta (el pipeline ya trocea
  por frases) o Nano solo para la primera frase y Turbo para el resto.
- El VAD semántico de Kyutai dispara por significado, no por silencio fijo: en la práctica
  recorta 0.5–1s frente al `eot_timeout` clásico de 1500ms. Es la mayor ganancia frente a
  Deepgram con timeout conservador.
- Red: si el backend Node también corre en el pod (o en la misma región), el tramo de red
  interno desaparece y solo queda Twilio ↔ pod.

## VRAM: caben juntos de sobra

| Modelo | VRAM aprox |
|---|---|
| Kyutai stt-1b (fp16) + Mimi | ~2.5–3GB |
| Chatterbox Turbo + banco de voces | ~4–6GB |
| SER (wav2vec2 o emotion2vec+) | ~0.5–1GB |
| **Total** | **~8–10GB** |

En 24GB sobra incluso para añadir el smart-turn y un margen para picos. Qwen3-Omni
(análisis post-llamada) NO cabe con esto en 24GB: va en otro pod o se lanza bajo demanda.

## Concurrencia (el límite real del pod)

- **Kyutai STT: 1 stream activo por GPU** (mismo límite que el gateway Moshi; el estado
  streaming de Mimi/LM no está batcheado). Chatterbox además serializa con un lock global.
- Traducción: **1 llamada simultánea por GPU** con la implementación actual. Para N
  llamadas: N pods, o batching en `kyutai_stt.py` (moshi soporta batch_size>1, no trivial).
- El coste por paso no depende de la longitud de la llamada (estado O(1) por frame).

## Cómo medir en el pod (no fiarse de esta tabla)

```bash
# STT: latencia por frame en estacionario
cd voice-engine && python - <<'EOF'
import asyncio, time, numpy as np
from kyutai_stt import KyutaiStream, runtime
async def main():
    runtime.ensure_loaded(); runtime.acquire()
    s = KyutaiStream(runtime); await s.open()
    rng = np.random.default_rng(0); ts = []
    for _ in range(120):
        f = (rng.standard_normal(runtime.frame_size)*0.02).astype(np.float32)
        t = time.time(); await s.step(f); ts.append(time.time()-t)
    tail = np.array(ts[60:])*1000
    print(f"media {tail.mean():.0f}ms p95 {np.percentile(tail,95):.0f}ms (presupuesto 80ms)")
    await s.close()
asyncio.run(main())
EOF

# TTS: por frase (con el server de chatterbox arrancado)
time curl -s -X POST localhost:8600/tts -d '{"text":"Hi, thanks for taking my call today."}' -o /dev/null
```

En Linux con GPU Ampere/Ada: quitar `NO_TORCH_COMPILE` del entorno si hay triton
(el módulo solo lo fuerza como default; con `torch.compile` el paso STT baja aún más)
y dejar que el dtype caiga solo a bf16 (`KYUTAI_STT_DTYPE` para forzar).
