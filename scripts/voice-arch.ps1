# Cambia el modo de voz en backend/.env (test RunPod, docs/PLAN_TEST_RUNPOD_8H.md).
# Uso: .\scripts\voice-arch.ps1 modular | duplex   — luego reiniciar el backend.
param([Parameter(Mandatory)][ValidateSet('modular', 'duplex')][string]$Mode)
$envFile = Join-Path $PSScriptRoot '..\backend\.env'
(Get-Content $envFile) -replace '^#?\s*VOICE_ENGINE_ARCHITECTURE=.*', "VOICE_ENGINE_ARCHITECTURE=$Mode" |
  Set-Content $envFile -Encoding utf8
Write-Host "VOICE_ENGINE_ARCHITECTURE=$Mode escrito. Reinicia el backend para aplicarlo."
