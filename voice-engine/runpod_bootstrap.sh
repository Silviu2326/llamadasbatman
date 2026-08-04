#!/usr/bin/env bash
# Bootstrap del pod RunPod para el test de 8h (ver docs/PLAN_TEST_RUNPOD_8H.md).
# Uso: subir voice-engine/ al pod con scp y ejecutar:  bash runpod_bootstrap.sh
# Idempotente: si los pesos ya están en el volumen /workspace, no re-descarga.
set -euo pipefail

export HF_HOME=/workspace/hf
mkdir -p /workspace/models

python -m venv /workspace/venv 2>/dev/null || true
. /workspace/venv/bin/activate

cd "$(dirname "$0")"
pip install -e '.[duplex]'
pip install vllm

python - <<'EOF'
from huggingface_hub import snapshot_download
for repo in ('kyutai/moshiko-pytorch-bf16', 'Qwen/Qwen3-8B'):
    print('descargando', repo)
    snapshot_download(repo)
EOF
python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo')"

# Voces Piper (es-ES y en_US; elige con VOICE_ENGINE_PIPER_MODEL)
BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main
for v in es/es_ES/davefx/medium/es_ES-davefx-medium en/en_US/lessac/medium/en_US-lessac-medium; do
  f=$(basename "$v")
  [ -f "/workspace/models/$f.onnx" ] || wget -q -P /workspace/models "$BASE/$v.onnx" "$BASE/$v.onnx.json"
done

# Extras opcionales para la sesión de "venta real" — best-effort, nunca rompen
# el bootstrap si el paquete o el repo no están disponibles.
# 1) Qwen3-TTS: prosodia más humana que Piper (A/B con VOICE_ENGINE_TTS_PROVIDER=qwen3).
pip install -U qwen-tts soundfile || echo "AVISO: qwen-tts no instalado (opcional)"
python - <<'EOF' || echo "AVISO: pesos Qwen3-TTS no descargados (opcional)"
from huggingface_hub import snapshot_download
snapshot_download('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice')
EOF
# 2) Chatterbox (Resemble AI, MIT): TTS multilingüe con prosodia casi-ElevenLabs
#    (A/B con VOICE_ENGINE_TTS_PROVIDER=chatterbox). Se instala aparte porque
#    pinea sus propias versiones de torch — si choca con vllm, solo avisa.
pip install -U chatterbox-tts || echo "AVISO: chatterbox-tts no instalado (opcional)"
python - <<'EOF' || echo "AVISO: pesos Chatterbox no descargados (opcional)"
from huggingface_hub import snapshot_download
snapshot_download('ResembleAI/chatterbox')
EOF
# 3) Smart Turn v3: fin de turno semántico en vez de solo VAD+timeout
#    (VOICE_ENGINE_SMART_TURN_ENABLED=true + VOICE_ENGINE_SMART_TURN_MODEL=<onnx>).
python - <<'EOF' || echo "AVISO: Smart Turn no descargado (opcional)"
from huggingface_hub import snapshot_download
path = snapshot_download('pipecat-ai/smart-turn-v3')
print('Smart Turn en', path, '- apunta VOICE_ENGINE_SMART_TURN_MODEL al .onnx de ese directorio')
EOF

echo "== LISTO =="
echo "1) vllm serve Qwen/Qwen3-8B --max-model-len 8192 --gpu-memory-utilization 0.35 &"
echo "2) exportar VOICE_ENGINE_* y python server.py        (:9100)"
echo "3) exportar VOICE_DUPLEX_* y python moshi_gateway.py (:9200)"
echo "Comandos completos en docs/PLAN_TEST_RUNPOD_8H.md"
