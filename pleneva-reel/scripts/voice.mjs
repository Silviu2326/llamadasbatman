// Genera la locución con ElevenLabs y los tiempos por palabra para el reel.
// Uso: npm run voice   (lee ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID de .env)
// Escribe la toma en bruto; scripts/tighten.mjs recorta después los silencios.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = env.ELEVENLABS_API_KEY;
const VOICE = env.ELEVENLABS_VOICE_ID;
if (!KEY || !VOICE) throw new Error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en .env");

const TEXT = [
  "Si mañana tuvieras cola en la puerta...",
  "¿qué cambiarías?",
  '<break time="1.6s" />',
  "Subirías precios.",
  '<break time="0.5s" />',
  "Dirías que no a los clientes que te amargan.",
  '<break time="0.5s" />',
  "Contratarías.",
  '<break time="0.5s" />',
  "Te cogerías vacaciones.",
  '<break time="1.3s" />',
  "¿Y por qué no lo haces ya?",
  '<break time="0.9s" />',
  "Porque no tienes la cola.",
  '<break time="1.3s" />',
  "La cola te la ponemos nosotros.",
  '<break time="0.7s" />',
  "Pleneva. Te traemos clientes.",
].join(" ");

const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`,
  {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: TEXT,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  },
);
if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
const data = await res.json();

mkdirSync(new URL("../public", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/voice.raw.mp3", import.meta.url), Buffer.from(data.audio_base64, "base64"));

// Agrupar caracteres en palabras, ignorando las etiquetas <break>.
const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } =
  data.alignment;
const words = [];
let cur = null;
let inTag = false;
for (let i = 0; i < characters.length; i++) {
  const ch = characters[i];
  if (ch === "<") inTag = true;
  if (inTag) {
    if (ch === ">") inTag = false;
    continue;
  }
  if (/\s/.test(ch)) {
    if (cur) words.push(cur);
    cur = null;
    continue;
  }
  if (!cur) cur = { text: "", start: starts[i], end: ends[i] };
  cur.text += ch;
  cur.end = ends[i];
}
if (cur) words.push(cur);

writeFileSync(new URL("../src/words.raw.json", import.meta.url), JSON.stringify(words, null, 1));
console.log(`${words.length} palabras, termina en ${words.at(-1).end.toFixed(2)} s`);
console.log(words.map((w) => `${w.start.toFixed(2)} ${w.text}`).join("\n"));
