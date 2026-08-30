// Genera audio con una voz de Fish Audio.
// Uso: FISH_AUDIO_API_KEY=... [FISH_SPEED=0.9] node scripts/fish-tts.mjs <reference_id> <salida.mp3> "<texto>"
// FISH_SPEED: velocidad (0.5–2, por defecto 1). Los saltos de línea y puntos suspensivos generan pausas.
import { writeFileSync } from 'node:fs';
const [,, referenceId, outFile, text] = process.argv;
const apiKey = process.env.FISH_AUDIO_API_KEY;
const speed = Number(process.env.FISH_SPEED || 1);
if (!referenceId || !outFile || !text || !apiKey) {
  console.error('Uso: FISH_AUDIO_API_KEY=... node scripts/fish-tts.mjs <reference_id> <salida.mp3> "<texto>"');
  process.exit(1);
}
const res = await fetch('https://api.fish.audio/v1/tts', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', model: 's1' },
  body: JSON.stringify({ text, reference_id: referenceId, format: 'mp3', mp3_bitrate: 128, latency: 'normal', prosody: { speed, volume: 0 } }),
});
if (!res.ok) { console.error(`Error ${res.status}: ${await res.text()}`); process.exit(1); }
writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
console.log(`Audio guardado: ${outFile}`);
