// Genera los efectos de sonido del reel con ElevenLabs (solo los que falten).
// Uso: npm run sfx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ELEVENLABS_API_KEY) throw new Error("Falta ELEVENLABS_API_KEY en .env");

const SFX = {
  whoosh: ["Fast clean whoosh transition, short swipe, modern motion graphics", 0.7],
  pop: ["Short soft cartoon pop, bubbly UI pop, clean", 0.5],
  stamp: ["Heavy rubber stamp slam on a wooden desk, punchy thud", 0.8],
  cash: ["Cash register cha-ching bell, short and bright", 1.0],
  tick: ["Light playful UI tick, small bubble blip", 0.5],
  steps: ["Several people walking quickly and stopping, light footsteps shuffle, cartoon", 1.5],
  switch: ["Loud mechanical light switch click, then electric power down sound, lights turning off", 1.0],
  rush: ["Crowd of people rushing in excited, cartoon stampede whoosh, short", 1.6],
  shimmer: ["Bright sparkling chime swell, immediate start, magical logo reveal sparkle", 1.5],
  flip: ["Cardboard sign flipping over, quick paper flap", 0.6],
  boom: ["Deep cinematic bass hit, short impact, clean", 1.2],
  scratch: ["Vinyl record scratch stop, comedic, music stops abruptly", 0.8],
  riser: ["Fast reverse cymbal swell riser building into a drop, immediate start", 1.2],
  heartbeat: ["Tense slow heartbeat, two deep thumps, cinematic", 1.6],
  clock: ["Loud clock ticking, tick tock, tense", 2.0],
  crickets: ["Crickets chirping in awkward silence, empty night", 2.5],
  cheer: ["Crowd cheering and applauding excited, celebration, starts immediately", 2.5],
  confetti: ["Party popper confetti cannon pop with paper rustle", 1.0],
  ding: ["Bright bell ding notification, cheerful", 0.6],
  sparkle: ["Short magical sparkle twinkle", 0.8],
  subdrop: ["Deep sub bass drop, cinematic tension, dark", 1.5],
  wind: ["Lonely desert wind gust, tumbleweed rolling", 2.2],
  boing: ["Cartoon boing spring bounce, playful", 0.6],
};

const dir = new URL("../public/sfx/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, [text, duration]] of Object.entries(SFX)) {
  const file = new URL(`${name}.mp3`, dir);
  if (existsSync(file)) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: duration, prompt_influence: 0.6 }),
  });
  if (!res.ok) throw new Error(`${name}: ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`ok ${name}`);
}
