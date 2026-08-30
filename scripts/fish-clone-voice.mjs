// Clona una voz en Fish Audio a partir de los primeros N segundos de un audio.
// Uso: FISH_AUDIO_API_KEY=... node scripts/fish-clone-voice.mjs <audio> [titulo] [segundos=30]
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const [,, input, title = 'Voz clonada', seconds = '30'] = process.argv;
const apiKey = process.env.FISH_AUDIO_API_KEY;
if (!input || !apiKey) {
  console.error('Uso: FISH_AUDIO_API_KEY=... node scripts/fish-clone-voice.mjs <audio> [titulo] [segundos]');
  process.exit(1);
}

// 1) Recorte a los primeros N segundos, mono 44.1 kHz WAV (formato que acepta Fish)
const out = join(mkdtempSync(join(tmpdir(), 'fish-')), 'ref.wav');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-t', seconds, '-ac', '1', '-ar', '44100', out], { stdio: 'inherit' });
console.log(`Recorte listo (${seconds}s): ${out}`);

// 2) Creación del modelo de voz
const form = new FormData();
form.append('visibility', 'private');
form.append('type', 'tts');
form.append('title', title);
form.append('train_mode', 'fast');
form.append('enhance_audio_quality', 'true');
form.append('voices', new Blob([readFileSync(out)], { type: 'audio/wav' }), 'ref.wav');

const res = await fetch('https://api.fish.audio/model', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
});
const body = await res.text();
if (!res.ok) {
  console.error(`Error ${res.status}: ${body}`);
  process.exit(1);
}
const model = JSON.parse(body);
console.log('Modelo creado:');
console.log(`  id:     ${model._id}`);
console.log(`  titulo: ${model.title}`);
console.log(`  origen: ${basename(input)}`);
console.log(`\nPara usarlo: reference_id="${model._id}" en /v1/tts`);
