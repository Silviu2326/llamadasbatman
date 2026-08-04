# Plan: test de 8 horas en RunPod (14:00–22:00) — Modular + Duplex

Fecha: 2026-07-27
Objetivo: probar los dos modos de llamada (`Vendrava Voice Modular` :9100 y `Vendrava Duplex` :9200) en una sesión de 8 horas gastando lo mínimo. Precios verificados hoy en [runpod.io/pricing](https://www.runpod.io/pricing).

## Qué opción coger

**Un solo Pod Secure Cloud con L40S 48 GB a US$0,99/h.** Un pod, una GPU, los dos workers dentro. 48 GB caben ambos a la vez para una sesión de test (Modular ~12–16 GB + Moshi bf16 ~16–20 GB + whisper paralelo).

| Opción | Precio | 8 h | Veredicto |
|---|---:|---:|---|
| **L40S 48 GB Secure** | $0,99/h | **~$7,90** | **Recomendada.** Es la GPU objetivo de producción según `VOICE_ENGINE_DESPLIEGUE_OPCIONES.md`: las latencias P50/P95 que midas esta noche son las reales |
| RTX A6000 48 GB Secure | $0,49/h | ~$3,90 | Alternativa si quieres gastar la mitad. Misma VRAM, pero Ampere (más lenta): tus métricas de latencia saldrán peores que en producción |
| RTX 4090 24 GB Secure | $0,69/h | ~$5,50 | No: 24 GB es borderline para Duplex y no cabe todo junto — tendrías que parar Modular para arrancar Duplex |
| 2 pods (uno por modo) | ~$2/h | ~$17 | No hace falta para un test funcional; eso es para el A/B de producción |
| Serverless | — | — | No: cold start de pesos en el camino crítico de una llamada |

Community Cloud (L40S $0,79/h) ahorra ~$1,70 en toda la noche; no compensa el menor aislamiento aunque sean llamadas de prueba. Secure.

**Coste total estimado de la noche: menos de $10** (GPU ~$8,40 + volumen ~$0,20 + tráfico despreciable).

## Cómo gastar lo mínimo

1. **Facturación por segundo**: crea el pod a las 14:00 y **termínalo (Terminate, no Stop)** a las 22:00. Un pod en Stop sigue cobrando el disco del contenedor.
2. **Network Volume de 80 GB** (~$5,60/mes, se borra al acabar si no repites): los pesos (~40–60 GB: Moshi ~15 GB, Qwen3-8B ~16 GB, whisper large-v3-turbo ~1,6 GB, voz Piper) se descargan UNA vez, durante la ventana de preparación 14:00–16:00. Si repites otra noche, el volumen ya los tiene y arrancas en minutos.
3. **Nada de VM CPU aparte**: Node + Prisma + Redis corren en tu máquina local (la RTX 2080 sobra para el plano de control). Solo alquilas la GPU.
4. **Sin IP pública en la GPU**: túnel SSH desde tu máquina al pod. El WebSocket de voz nunca se expone a Internet (requisito del doc de despliegue) y te ahorras configurar firewall.

## Arquitectura de la noche (sin Twilio, en inglés)

El testeo usa el simulador de voz del navegador: página `/voz/test` con micrófono → WebSocket `/voice-sim/live` del backend local. Nada se expone a Internet.

```text
Navegador /voz/test (micrófono) ──> Node local (Fastify+Prisma+Redis)
                                        │ ssh -L 9100 / -L 9200
                                        v
                                 Pod RunPod L40S
                                   ├─ server.py        :9100 (Modular)
                                   └─ moshi_gateway.py :9200 (Duplex)
```

Ojo: la sesión de simulación corta a los 10 min por defecto; para conversaciones largas, `VOICE_SIM_MAX_DURATION_SECONDS=3600` en el backend.

## Antes de las 14:00 (se puede dejar hecho hoy, sin gastar nada)

- [ ] **RunPod**: cuenta creada, **crédito cargado** (es prepago; hacerlo hoy, no a las 14:00) y tu clave SSH pública añadida en Settings → SSH Keys.
- [ ] **Backend local arranca**: Postgres + Redis levantados, login en el frontend y la página `/voz/test` abre y pide micrófono — que las 16:00 no se conviertan en debugging del CRM.
- [x] **Agente en inglés**: creado en la BD — `Alex EN (test RunPod)` (id `cms3kmg6d0001vbecgtiu3m6z`, org `seed-org`, systemPrompt de ventas en inglés). Seleccionarlo en `/voz/test`; el login de esa org es `admin@vozia.ai`.
- [ ] **Tokens listos**: el bloque `VOICE_ENGINE_*` ya está añadido comentado al final de `backend/.env` (idioma en-US incluido). El día del test: descomentar.
- [ ] **Código al pod**: `voice-engine/` pesa 76 KB — se sube con `scp -P <puerto> -r voice-engine root@<pod>:/workspace/` (no hace falta PAT de GitHub en el pod).
- [ ] **Bootstrap**: `voice-engine/runpod_bootstrap.sh` instala dependencias y descarga todos los pesos (Moshi, Qwen3-8B, whisper, voces Piper en_US y es-ES) en un solo paso.
- [ ] Auriculares con micro decentes — el barge-in y el eco se prueban mucho mejor que con altavoces.

## Preparación 14:00–16:00 (pod + descargas + todo listo)

1. RunPod → Storage → New Network Volume, 80 GB, apunta el datacenter (el pod debe crearse en el mismo).
2. Deploy Pod: L40S, Secure Cloud, template `RunPod PyTorch` (CUDA), volumen montado en `/workspace`, SSH habilitado.
3. Subir el código y lanzar el bootstrap (instala deps y descarga todos los pesos):

```powershell
scp -P <puerto-ssh> -r voice-engine root@<pod>:/workspace/
ssh -p <puerto-ssh> root@<pod> "bash /workspace/voice-engine/runpod_bootstrap.sh"
```

4. vLLM para el LLM del modo modular: `vllm serve Qwen/Qwen3-8B --max-model-len 8192 --gpu-memory-utilization 0.35 &` (limitar VRAM para que quepa Moshi al lado).
5. Mientras descargan los pesos (~40–60 GB, cuenta 30–60 min según red del datacenter), en paralelo en tu máquina local: `.env` del backend, túneles SSH y ngrok (ver bloques de abajo). Así a las 16:00 solo queda arrancar workers.

## Sesión 16:00–22:00

### 16:00–16:30 — Arranque y smoke

```bash
# terminal 1 (pod): Modular
export VOICE_ENGINE_TOKEN=<secreto-1> VOICE_ENGINE_ARCHITECTURE=modular \
       VOICE_CALL_LANGUAGE=en-US VOICE_ENGINE_PIPER_MODEL=/workspace/models/en_US-lessac-medium.onnx \
       VOICE_ENGINE_LLM_BASE_URL=http://127.0.0.1:8000/v1 VOICE_ENGINE_LLM_MODEL=Qwen/Qwen3-8B
python server.py

# terminal 2 (pod): Duplex (Moshi es nativo en inglés)
export VOICE_DUPLEX_ENGINE_TOKEN=<secreto-2> VOICE_DUPLEX_MOSHI_REPO=kyutai/moshiko-pytorch-bf16 \
       VOICE_DUPLEX_MOSHI_DEVICE=cuda VOICE_DUPLEX_STT_MODEL=large-v3-turbo
python moshi_gateway.py

python smoke_duplex.py   # validación del camino completo antes de abrir el simulador
```

```powershell
# máquina local: túneles + Node
ssh -L 9100:127.0.0.1:9100 -L 9200:127.0.0.1:9200 root@<pod> -p <puerto-ssh>
```

`.env` del backend local:

```env
VOICE_ENGINE_MODE=remote
VOICE_ENGINE_ARCHITECTURE=modular
VOICE_CALL_LANGUAGE=en-US
VOICE_DUPLEX_LANGUAGE=en-US
VOICE_ENGINE_URL=ws://127.0.0.1:9100/ws
VOICE_ENGINE_TOKEN=<secreto-1>
VOICE_DUPLEX_ENGINE_URL=ws://127.0.0.1:9200/ws
VOICE_DUPLEX_ENGINE_TOKEN=<secreto-2>
VOICE_ENGINE_FALLBACK=false
VOICE_ENGINE_ALLOW_PROPRIETARY=false
VOICE_SIM_MAX_DURATION_SECONDS=3600
```

Reiniciar el backend y abrir `/voz/test` en el navegador: la simulación con micrófono es la "llamada" de toda la sesión.

### 16:30–19:00 — Modular (modo de producción, la mayor parte del tiempo)

El agente **abre la llamada hablando** (disclosure + presentación, la envía Node por sesión desde la config del agente — no hay que configurar nada). Ajustes en vivo en el pod si hace falta, reiniciando solo `server.py`:

```bash
export VOICE_ENGINE_LLM_MAX_TOKENS=120        # respuestas más cortas/rápidas (def. 160)
export VOICE_ENGINE_LLM_TEMPERATURE=0.55      # subir si suena repetitivo
export VOICE_ENGINE_SMART_TURN_ENABLED=true   # fin de turno semántico (el bootstrap
export VOICE_ENGINE_SMART_TURN_MODEL=<ruta .onnx de pipecat-ai/smart-turn-v3>
export VOICE_ENGINE_TTS_PROVIDER=qwen3        # A/B de prosodia contra Piper (opcional)
```

Última media hora del bloque: repetir 1–2 guiones con la **V3 Modular realista** (reiniciar `server.py` con `VOICE_ENGINE_BACKCHANNEL=true VOICE_ENGINE_AMBIENCE_LEVEL=0.004`) y anotar si las muletillas y el ruido de línea suman o restan (matriz de versiones en `MODOS_VOZ_MODULAR_VS_DUPLEX.md`).

Todo en inglés desde `/voz/test` con el agente configurado:

- Conversación básica: primer audio, coherencia del guion, cierre limpio.
- Barge-in: interrumpir al agente mientras habla.
- Silencios largos, ruido de fondo (altavoz con música/tele cerca del micro), acentos.
- Frases de opt-out en inglés ("stop calling me", "remove me from your list") y petición de transferencia a humano.
- Anotar P50/P95 de primer audio y de respuesta por turno (los logs de `sessionLogger` y observability ya lo registran).

Fuera de alcance sin Twilio: AMD/buzón, calidad µ-law 8 kHz y latencia PSTN real — queda para la sesión con telefonía.

### 19:00–21:00 — Duplex (canario)

- En el simulador no hay payload de experimento: cambiar de modo con `.\scripts\voice-arch.ps1 duplex` (o `modular` para volver) y reiniciar el backend (~30 s; ambos workers siguen corriendo en el pod).
- Mismos casos: naturalidad, solapamiento de voz, interrupciones, latencia.
- Última media hora: **V4 Duplex realista** — reiniciar `moshi_gateway.py` con `VOICE_DUPLEX_AMBIENCE_LEVEL=0.004 VOICE_DUPLEX_TEMPERATURE=0.6 VOICE_DUPLEX_TEXT_TEMPERATURE=0.5` y comparar contra la base.
- Vigilar VRAM (`nvidia-smi -l 5`): una sesión Moshi por GPU, no lanzar llamadas duplex concurrentes.
- Recordatorio del README: el checkpoint base no aplica el systemPrompt comercial; se evalúa naturalidad/interactividad, no el guion de negocio.

### 21:00–22:00 — Comparación directa y cierre

- Alternar 2–3 sesiones por modo con el mismo guion en inglés y anotar cuál gana en naturalidad, latencia y errores (el A/B por experimento queda para cuando haya Twilio). Veredicto final sobre las **4 versiones** (base y realista de cada modo): ¿los extras de realismo pasan a defaults de producción o se quedan apagados?
- Volcar logs/métricas/grabaciones autorizadas **a tu máquina local** (`scp`): todo lo que quede solo en el pod se pierde al terminar.
- 21:55: parar workers, `scp` final.
- **22:00: Terminate pod.** Decidir el volumen: se queda (~$5,60/mes) si repites esta semana; se borra si no.

## Checklist de cierre

- [ ] Pod en Terminate (no Stop) — verificar en la consola que no hay pods activos
- [ ] Logs y métricas copiados en local
- [ ] Decisión sobre el Network Volume tomada
- [ ] Tokens `VOICE_ENGINE_TOKEN`/`VOICE_DUPLEX_ENGINE_TOKEN` de la sesión descartados
- [ ] Bloque `VOICE_ENGINE_*` re-comentado en `backend/.env` (para que el dev local no apunte a un pod muerto)
- [ ] Resultados anotados: P50/P95 primer audio, barge-in, fallos, veredicto modular vs duplex
