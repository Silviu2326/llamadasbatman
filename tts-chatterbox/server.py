"""Servidor TTS local con Chatterbox Turbo/Nano + clasificador de emocion en voz (SER).

POST /tts  {"text": "...", "voice": "calm", "rate": 1.05}  ->  PCM16 mono 24kHz
POST /ser  cuerpo = PCM16 mono 16kHz crudo                 ->  {"label": "ang", "scores": {...}}
GET  /health  ->  200 cuando el modelo esta cargado

Arranque:  .venv\Scripts\python.exe server.py
Env: CHATTERBOX_VOICE_WAV (clip de referencia por defecto, >5s)
     CHATTERBOX_VOICE_DIR (carpeta con calm.wav/energetic.wav/empathetic.wav... >5s cada uno)
     CHATTERBOX_PORT (default 8600)
     CHATTERBOX_NANO=1 (modelo Nano, mas rapido y algo menos expresivo)
     CHATTERBOX_SER=0 (desactiva el clasificador de emocion)
     CHATTERBOX_SER_MODEL=emotion2vec (SER mas preciso, 9 emociones; pip install funasr)

Nota: Turbo/Nano ignoran exaggeration/cfg_weight — la expresividad viene del clip.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import librosa
import numpy as np
import torch
import torchaudio

PORT = int(os.environ.get("CHATTERBOX_PORT", "8600"))
VOICE_WAV = os.environ.get("CHATTERBOX_VOICE_WAV") or None
VOICE_DIR = os.environ.get("CHATTERBOX_VOICE_DIR") or None
NANO = os.environ.get("CHATTERBOX_NANO") == "1"
SER_ON = os.environ.get("CHATTERBOX_SER") != "0"
TARGET_SR = 24000
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

print(f"[chatterbox] cargando modelo {'Nano' if NANO else 'Turbo'}...", flush=True)
from chatterbox.tts_turbo import ChatterboxTurboTTS

model = ChatterboxTurboTTS.from_pretrained(device=DEVICE, nano=NANO)
lock = threading.Lock()  # ponytail: GPU serializada con un lock global — una peticion activa por vez

# Banco de voces: conditionals precomputados por clip, intercambiables por peticion
voices = {}
if VOICE_WAV:
    model.prepare_conditionals(VOICE_WAV)
voices["default"] = model.conds
if VOICE_DIR:
    for wav in sorted(Path(VOICE_DIR).glob("*.wav")):
        model.prepare_conditionals(str(wav))
        voices[wav.stem] = model.conds
        print(f"[chatterbox] voz cargada: {wav.stem}", flush=True)
model.conds = voices["default"]

ser = None
SER_MODEL = os.environ.get("CHATTERBOX_SER_MODEL", "wav2vec2")
if SER_ON:
    print(f"[chatterbox] cargando clasificador de emocion (SER, {SER_MODEL})...", flush=True)
    if SER_MODEL == "emotion2vec":
        from funasr import AutoModel
        ser = AutoModel(model="iic/emotion2vec_plus_base", hub="hf", disable_update=True)
    else:
        from transformers import pipeline as hf_pipeline
        ser = hf_pipeline("audio-classification", model="superb/wav2vec2-base-superb-er",
                          device=0 if DEVICE == "cuda" else -1)

with torch.inference_mode():
    model.generate("Warm up.")
print(f"[chatterbox] listo en :{PORT} (sr={model.sr}, voces={list(voices)}, ser={'on' if ser else 'off'})", flush=True)


def synthesize(text: str, voice: str = "default", rate: float = 1.0) -> bytes:
    with lock, torch.inference_mode():
        model.conds = voices.get(voice) or voices["default"]
        wav = model.generate(text)
    wav = wav.squeeze(0).cpu()
    if model.sr != TARGET_SR:
        wav = torchaudio.functional.resample(wav, model.sr, TARGET_SR)
    if abs(rate - 1.0) > 0.01:
        # time-stretch sin cambiar el pitch (mirroring de ritmo)
        wav = torch.from_numpy(librosa.effects.time_stretch(wav.numpy(), rate=float(rate)))
    return (wav.clamp(-1, 1) * 32767).to(torch.int16).numpy().tobytes()


def classify_emotion(pcm16k: bytes) -> dict:
    arr = np.frombuffer(pcm16k, dtype=np.int16).astype(np.float32) / 32768.0
    if SER_MODEL == "emotion2vec":
        with lock:
            res = ser.generate(arr, granularity="utterance", extract_embedding=False)[0]
        # etiquetas bilingues tipo "生气/angry" -> nos quedamos con la parte inglesa
        scores = {lb.split("/")[-1]: round(float(s), 3) for lb, s in zip(res["labels"], res["scores"])}
        return {"label": max(scores, key=scores.get), "scores": scores}
    with lock:
        results = ser(arr, top_k=4)
    return {"label": results[0]["label"], "scores": {r["label"]: round(r["score"], 3) for r in results}}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/health" else 404)
        self.end_headers()

    def do_POST(self):
        try:
            raw = self.rfile.read(int(self.headers["Content-Length"]))
            if self.path == "/tts":
                body = json.loads(raw)
                payload = synthesize(body["text"], body.get("voice", "default"), body.get("rate", 1.0))
                ctype = "audio/l16;rate=24000"
            elif self.path == "/ser" and ser is not None:
                payload = json.dumps(classify_emotion(raw)).encode()
                ctype = "application/json"
            else:
                self.send_response(404); self.end_headers(); return
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:  # noqa: BLE001
            print(f"[chatterbox] error: {e}", flush=True)
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
