# Cambia entre las versiones V1..V6 del A/B de voz (docs/MODOS_VOZ_MODULAR_VS_DUPLEX.md).
# Reinicia el worker correcto en el pod con sus envs, fija la arquitectura en backend/.env
# y fuerza el reinicio del backend (via --watch). Uso:  .\scripts\voice-version.ps1 V5
param([Parameter(Mandatory)][ValidateSet('V1', 'V2', 'V3', 'V4', 'V5', 'V6')][string]$Version)

# ponytail: pod de la sesion 2026-07-28 hardcodeado — actualizar si se recrea el pod
$SshHost = 'root@64.247.206.201'
$SshPort = 16414

$envFile = Join-Path $PSScriptRoot '..\backend\.env'
$envText = Get-Content $envFile -Raw
$tokModular = [regex]::Match($envText, 'VOICE_ENGINE_TOKEN=(\S+)').Groups[1].Value
$tokDuplex = [regex]::Match($envText, 'VOICE_DUPLEX_ENGINE_TOKEN=(\S+)').Groups[1].Value

$extras = @{
  V1 = ''
  V2 = ''
  V3 = 'export VOICE_ENGINE_BACKCHANNEL=true VOICE_ENGINE_AMBIENCE_LEVEL=0.004 VOICE_ENGINE_LLM_MAX_TOKENS=120'
  V4 = 'export VOICE_DUPLEX_AMBIENCE_LEVEL=0.004 VOICE_DUPLEX_TEMPERATURE=0.6 VOICE_DUPLEX_TEXT_TEMPERATURE=0.5'
  V5 = 'export VOICE_ENGINE_TTS_PROVIDER=chatterbox'
  V6 = 'export VOICE_ENGINE_TTS_PROVIDER=chatterbox VOICE_ENGINE_BACKCHANNEL=true VOICE_ENGINE_AMBIENCE_LEVEL=0.004 VOICE_ENGINE_LLM_MAX_TOKENS=120'
}[$Version]

$isModular = $Version -in 'V1', 'V3', 'V5', 'V6'
$arch = if ($isModular) { 'modular' } else { 'duplex' }

if ($isModular) {
  $remote = @"
source /workspace/venv/bin/activate
cd /workspace/voice-engine
pkill -f 'server[.]py'; sleep 1
export HF_HOME=/workspace/hf
export VOICE_ENGINE_TOKEN=$tokModular VOICE_ENGINE_ARCHITECTURE=modular
export VOICE_ENGINE_PIPER_MODEL=/workspace/models/en_US-lessac-medium.onnx
export VOICE_ENGINE_LLM_BASE_URL=http://127.0.0.1:8000/v1 VOICE_ENGINE_LLM_MODEL=Qwen/Qwen3-8B
export VOICE_ENGINE_PRELOAD=true
$extras
nohup python server.py > /tmp/server.log 2>&1 &
for i in `$(seq 1 45); do curl -s --max-time 2 http://127.0.0.1:9100/health 2>/dev/null | grep -q ok && { echo 'WORKER MODULAR OK'; exit 0; }; pgrep -f 'server[.]py' >/dev/null || break; sleep 2; done
echo 'FALLO — ultimas lineas:'; tail -20 /tmp/server.log; exit 1
"@
}
else {
  $remote = @"
source /workspace/venv/bin/activate
cd /workspace/voice-engine
pkill -f 'moshi_gateway[.]py'; sleep 1
export HF_HOME=/workspace/hf
export VOICE_DUPLEX_ENGINE_TOKEN=$tokDuplex VOICE_DUPLEX_MOSHI_REPO=kyutai/moshiko-pytorch-bf16
export VOICE_DUPLEX_MOSHI_DEVICE=cuda VOICE_DUPLEX_STT_MODEL=large-v3-turbo
export VOICE_DUPLEX_PRELOAD=true
$extras
nohup python moshi_gateway.py > /tmp/duplex.log 2>&1 &
for i in `$(seq 1 45); do curl -s --max-time 2 http://127.0.0.1:9200/health 2>/dev/null | grep -q ok && { echo 'WORKER DUPLEX OK'; exit 0; }; pgrep -f 'moshi_gateway[.]py' >/dev/null || break; sleep 2; done
echo 'FALLO — ultimas lineas:'; tail -20 /tmp/duplex.log; exit 1
"@
}

# base64 para esquivar el quoting PowerShell->ssh->bash (ya nos costo una letra "r")
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($remote -replace "`r`n", "`n")))
ssh -p $SshPort $SshHost "echo $b64 | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { Write-Host "El worker no arranco; no toco el backend." -ForegroundColor Red; exit 1 }

(Get-Content $envFile) -replace '^#?\s*VOICE_ENGINE_ARCHITECTURE=.*', "VOICE_ENGINE_ARCHITECTURE=$arch" |
  Set-Content $envFile -Encoding utf8
# node --watch relanza el proceso al tocar un fuente y relee --env-file
(Get-Item (Join-Path $PSScriptRoot '..\backend\src\index.ts')).LastWriteTime = Get-Date
Write-Host "$Version activa (arquitectura $arch). Worker reiniciado en el pod y backend recargando (~5 s)."
