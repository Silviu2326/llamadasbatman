import { loadFont } from "@remotion/google-fonts/Poppins";
import words from "./words.json";

export const { fontFamily: FONT } = loadFont("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin", "latin-ext"],
});

// Colores del logo Pleneva.
export const C = {
  orange: "#FE6416",
  orangeLight: "#FF9D3C",
  blue: "#0158BE",
  blueLight: "#2F8BFF",
  navy: "#002553",
  night: "#000D25",
  white: "#FFFFFF",
  grey: "#8A97AB",
};

export const FPS = 30;
export const W = 1080;
export const H = 1920;
/** Línea del suelo donde se apoya la cola. */
export const FLOOR = 1470;

type Word = { text: string; start: number; end: number };
const WORDS = words as Word[];
const norm = (s: string) => s.toLowerCase().replace(/[¿?¡!.,…]/g, "");

/** Frame en que empieza la palabra `text` (n-ésima aparición). */
export function at(text: string, n = 0): number {
  const hits = WORDS.filter((w) => norm(w.text) === norm(text));
  const w = hits[n];
  if (!w) throw new Error(`Palabra no encontrada en la locución: ${text} (#${n})`);
  return Math.round(w.start * FPS);
}

export const VOICE_END = Math.round(WORDS[WORDS.length - 1].end * FPS);
export const DURATION = VOICE_END + Math.round(2.2 * FPS);

/** ¿Está hablando la voz en este frame? (para bajar la música por debajo). */
export function speaking(frame: number): boolean {
  const t = frame / FPS;
  return WORDS.some((w) => t >= w.start - 0.08 && t <= w.end + 0.12);
}
