# VozIA voice-engine

Servicio opcional de inferencia autoalojada. Recibe PCM16 a 16 kHz desde el backend Node y devuelve eventos con audio PCM16 a 24 kHz.

## Modelos del servicio

- STT: `faster-whisper`; por defecto `large-v3-turbo`.
- LLM: cualquier servidor compatible con OpenAI, recomendado vLLM con Qwen3 en modo `enable_thinking=false`.
- TTS: Piper mediante su API Python. Para llamadas en español hay que descargar y revisar una voz es-ES compatible.

El servidor no conoce Prisma ni ejecuta herramientas CRM. Node sigue siendo la autoridad de tenant, permisos, compliance y persistencia.

El bucle de interacción es continuo: mientras entra audio, el sidecar mantiene el buffer de la intervención, emite transcripciones parciales periódicas, cancela una respuesta activa al detectar barge-in y usa Smart Turn después del silencio para decidir si debe responder o esperar una continuación.

## Arranque local

```bash
cd voice-engine
python -m venv .venv
. .venv/bin/activate
pip install -e .

export VOICE_ENGINE_TOKEN=change-this
export VOICE_ENGINE_ARCHITECTURE=modular
export VOICE_CALL_LANGUAGE=es-ES
export VOICE_ENGINE_PIPER_MODEL=/models/voice-es.onnx
export VOICE_ENGINE_LLM_BASE_URL=http://127.0.0.1:8000/v1
export VOICE_ENGINE_LLM_MODEL=Qwen/Qwen3-8B
python server.py
```

En Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
$env:VOICE_ENGINE_TOKEN = 'change-this'
$env:VOICE_ENGINE_ARCHITECTURE = 'modular'
$env:VOICE_CALL_LANGUAGE = 'es-ES'
$env:VOICE_ENGINE_PIPER_MODEL = 'C:\models\voice-es.onnx'
$env:VOICE_ENGINE_LLM_BASE_URL = 'http://127.0.0.1:8000/v1'
$env:VOICE_ENGINE_LLM_MODEL = 'Qwen/Qwen3-8B'
python server.py
```

El modelo Piper debe tener su archivo `.onnx` y el `.onnx.json` asociado en la misma carpeta. La descarga de voces debe hacerse desde las fuentes oficiales y con revisión de licencia.

Para probar Qwen3-TTS de forma controlada, instala su paquete en el entorno del sidecar y cambia el proveedor:

```bash
pip install -U qwen-tts soundfile
export VOICE_ENGINE_TTS_PROVIDER=qwen3
export VOICE_ENGINE_TTS_LANGUAGE=Spanish
export VOICE_ENGINE_QWEN3_MODEL=Qwen/Qwen3-TTS-0.6B-CustomVoice
export VOICE_ENGINE_QWEN3_SPEAKER=Ryan
export VOICE_ENGINE_QWEN3_DEVICE=cuda:0
```

Si Qwen3-TTS no puede cargar el modelo, el sidecar vuelve automáticamente a Piper.

## Configuración del backend Node

```env
VOICE_ENGINE_MODE=remote
VOICE_ENGINE_ARCHITECTURE=modular
VOICE_CALL_LANGUAGE=es-ES
VOICE_ENGINE_URL=ws://127.0.0.1:9100/ws
VOICE_ENGINE_TOKEN=change-this
VOICE_ENGINE_FALLBACK=false
VOICE_ENGINE_ALLOW_PROPRIETARY=false
```

El backend también puede seleccionar `duplex` para conectar un gateway local de
Moshi/Mimi separado del sidecar modular:

```env
VOICE_ENGINE_ARCHITECTURE=duplex
VOICE_DUPLEX_LANGUAGE=es-ES
VOICE_DUPLEX_ENGINE_URL=ws://127.0.0.1:9200/ws
VOICE_DUPLEX_ENGINE_TOKEN=change-this
```

La variante `duplex` debe apuntar al gateway `moshi_gateway.py`, no al sidecar
modular de esta carpeta. La selección se puede hacer por llamada desde el payload de un experimento con
`{"architecture":"duplex"}`. Si no se configura nada, se usa `modular`.

## Vendrava Duplex con Moshi/Mimi

Instala el extra de GPU y ejecuta el gateway dedicado:

```bash
pip install -e '.[duplex]'
export VOICE_DUPLEX_ENGINE_TOKEN=change-this
export VOICE_DUPLEX_MOSHI_REPO=kyutai/moshiko-pytorch-bf16
export VOICE_DUPLEX_MOSHI_DEVICE=cuda
export VOICE_DUPLEX_STT_MODEL=large-v3-turbo
# Optional: use a locally merged Moshi-Call-EN checkpoint instead of the Hub repo.
# export VOICE_DUPLEX_MOSHI_WEIGHT=/models/moshi-call-en/consolidated.safetensors
# export VOICE_DUPLEX_MIMI_WEIGHT=/models/moshi-call-en/tokenizer-e351c8d8e...safetensors
python moshi_gateway.py
```

Con los pesos instalados, valida el camino completo con:

```bash
python smoke_duplex.py
```

El gateway usa Moshi/Mimi para el audio full dúplex y un `faster-whisper`
paralelo configurable por sesión, con `es-ES` como valor por defecto. El
checkpoint base no aplica todavía el `systemPrompt` comercial como
condicionamiento; el gateway lo conserva para trazabilidad y Node sigue siendo
la autoridad de acciones. Hasta disponer de un checkpoint alineado, `duplex`
continúa siendo un canario de naturalidad/interactividad, no un agente de
negocio autónomo.

La ruta legacy de Deepgram/ElevenLabs sólo se activa deliberadamente con `VOICE_ENGINE_MODE=legacy`, `VOICE_ENGINE_ALLOW_PROPRIETARY=true` y `VOICE_ENGINE_FALLBACK=true`. En el despliegue OSS esos valores deben permanecer en `false`; si el sidecar falla, la llamada debe fallar de forma visible y no enviar audio a un proveedor externo.

## Contrato

El contrato de eventos está definido en `docs/VOZ_OPEN_SOURCE_FULL_DUPLEX.md` y validado por `backend/src/__tests__/voiceEngineProtocol.test.ts`.

## Limitaciones de esta primera versión

- La detección de fin de turno usa VAD por energía y timeout por defecto; Smart Turn v3 puede activarse de forma opcional.
- `faster-whisper` procesa el turno acumulado, no cada parcial como Deepgram Flux.
- Los parciales se calculan sobre snapshots del buffer; no son todavía un decoder STT incremental nativo.
- Piper entrega la voz por frases; el protocolo sí permite chunks y cancelación, pero la primera versión no es speech-to-speech nativa.
- La calidad final de una llamada PSTN sigue limitada por µ-law/G.711 a 8 kHz.

## Smart Turn opcional

El sidecar puede usar Smart Turn v3 como clasificador semántico de final de turno después del VAD:

```env
VOICE_ENGINE_SMART_TURN_ENABLED=true
VOICE_ENGINE_SMART_TURN_MODEL=/models/smart-turn-v3.2.onnx
```

El modelo debe ser el ONNX compatible de Smart Turn y recibir audio mono PCM de 16 kHz. Si falta el modelo o no se pueden cargar `onnxruntime` y `transformers`, el servicio anuncia `turn.detector.fallback` y usa el detector energético anterior. La implementación conserva el buffer del turno cuando Smart Turn devuelve `may_continue`, de modo que una pausa natural no dispara una respuesta prematura.
