// Genera con ElevenLabs Music una pista por emoción del reel (solo las que falten).
// Uso: npm run music
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ELEVENLABS_API_KEY) throw new Error("Falta ELEVENLABS_API_KEY en .env");

const TRACKS = {
  tension:
    "Dark suspenseful cinematic intro, low pulsing synth bass like a heartbeat, soft ticking percussion, building curiosity and anticipation, minimal, no drums drop, instrumental",
  euphoria:
    "Upbeat, joyful, bouncy pop instrumental for a fun social media ad, claps, plucky synths, whistles, 124 bpm, instant energy from the first beat, happy and playful",
  sad: "Sad lonely solo piano, slow and melancholic, sparse soft notes, emotional, empty room reverb, instrumental",
  triumph:
    "Epic triumphant energetic pop anthem drop, massive drums and bass hit right on the very first beat, stomps and claps, celebratory, confident brand anthem, 124 bpm, instrumental",
};

const dir = new URL("../public/music/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, prompt] of Object.entries(TRACKS)) {
  const file = new URL(`${name}.mp3`, dir);
  if (existsSync(file)) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: 12000, model_id: "music_v1", force_instrumental: true }),
  });
  if (!res.ok) throw new Error(`${name}: ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`ok ${name}`);
}
