// Recorta los silencios de la locución a una duración pensada para cada corte
// y reajusta los tiempos por palabra. Entrada: public/voice.raw.mp3 + src/words.raw.json.
// Salida: public/voice.mp3 + src/words.json.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const p = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const RAW = p("public/voice.raw.mp3");
const words = JSON.parse(readFileSync(p("src/words.raw.json"), "utf8"));
const norm = (s) => s.toLowerCase().replace(/[¿?¡!.,…]/g, "");

// Silencio que se deja DESPUÉS de cada palabra (segundos). Clave: palabra#aparición.
const KEEP_AFTER = {
  "puerta#0": 0.3,
  "cambiarías#0": 0.9, // la pausa del gancho: tensión, pero sin aire muerto
  "precios#0": 0.3, // la lista va rápida
  "amargan#0": 0.3,
  "contratarías#0": 0.3,
  "vacaciones#0": 0.7,
  "ya#0": 0.5,
  "cola#1": 0.75, // "Porque no tienes la cola." ... remate
  "nosotros#0": 0.5,
  "pleneva#0": 0.35,
};
const DEFAULT_KEEP = 0.4;

const seen = {};
const keyed = words.map((w) => {
  const k = norm(w.text);
  const n = seen[k] ?? 0;
  seen[k] = n + 1;
  return { ...w, key: `${k}#${n}` };
});

// Silencios reales del audio.
const det = spawnSync("ffmpeg", ["-hide_banner", "-i", RAW, "-af", "silencedetect=noise=-40dB:d=0.2", "-f", "null", "-"], {
  encoding: "utf8",
});
const log = det.stderr;
const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);

const cuts = [];
starts.forEach((s, i) => {
  const e = ends[i];
  if (e === undefined) return; // silencio final: se deja
  const prev = [...keyed].reverse().find((w) => w.start < s);
  if (!prev) return; // silencio inicial
  const keep = KEEP_AFTER[prev.key] ?? DEFAULT_KEEP;
  const dur = e - s;
  if (dur <= keep + 0.05) return;
  // Se conserva la cola del sonido anterior y el ataque del siguiente.
  const a = s + keep * 0.55;
  const b = e - keep * 0.45;
  cuts.push({ a, b, after: prev.text });
});

const removedBefore = (t) => cuts.reduce((acc, c) => acc + (t >= c.b ? c.b - c.a : t > c.a ? t - c.a : 0), 0);
const out = words.map((w) => ({
  text: w.text,
  start: +(w.start - removedBefore(w.start)).toFixed(3),
  end: +(w.end - removedBefore(w.end)).toFixed(3),
}));

const expr = cuts.map((c) => `between(t,${c.a.toFixed(3)},${c.b.toFixed(3)})`).join("+") || "0";
execFileSync("ffmpeg", [
  "-y", "-v", "error", "-i", RAW,
  "-af", `aselect='not(${expr})',asetpts=N/SR/TB`,
  "-c:a", "libmp3lame", "-b:a", "192k", p("public/voice.mp3"),
]);
writeFileSync(p("src/words.json"), JSON.stringify(out, null, 1));

const total = cuts.reduce((s, c) => s + c.b - c.a, 0);
for (const c of cuts) console.log(`tras «${c.after}»: -${(c.b - c.a).toFixed(2)} s`);
console.log(`Recortados ${total.toFixed(2)} s. Nueva duración de voz: ${out.at(-1).end.toFixed(2)} s`);
