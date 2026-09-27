import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FLOOR, FONT, speaking } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Muelle que arranca en `from` (frames absolutos). */
export function useSpring(from: number, config: Partial<{ damping: number; stiffness: number; mass: number }> = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - from, fps, config: { damping: 13, stiffness: 170, ...config } });
}

/** Golpe de cámara: pequeño zoom que decae tras cada frame de `hits`. */
export function useKick(hits: number[], amount = 0.045) {
  const frame = useCurrentFrame();
  let k = 0;
  for (const h of hits) {
    const t = frame - h;
    if (t >= 0 && t < 18) k = Math.max(k, amount * Math.exp(-t / 4) * (t < 2 ? t / 2 : 1));
  }
  return 1 + k;
}

/** Sacudida que decae tras `at`. */
export function useShake(at: number, strength = 22) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 14) return "none";
  const k = (1 - t / 14) * strength;
  return `translate(${Math.sin(t * 2.7) * k}px, ${Math.cos(t * 3.3) * k}px)`;
}

type Enter = "push" | "drop" | "zoom" | "fade";

/**
 * Escena visible entre `from` y `to`. Entra con desenfoque de movimiento y sale
 * atravesando la cámara; la siguiente escena se solapa para que no haya negro.
 */
export const Scene: React.FC<{ from: number; to: number; enter?: Enter; children: React.ReactNode }> = ({
  from,
  to,
  enter = "push",
  children,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const e = interpolate(frame, [from, from + 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const x = interpolate(frame, [to - 6, to], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const blur = (1 - e) * 16 + x * 12;
  let tx = 0;
  let ty = 0;
  let sc = 1;
  if (enter === "push") tx = (1 - e) * 220;
  if (enter === "drop") ty = (1 - e) * -260;
  if (enter === "zoom") sc = 1 + (1 - e) * 0.35;
  sc *= 1 + x * 0.12;
  const drift = interpolate(frame, [from, to], [1, 1.03], clamp);
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(enter === "fade" ? e : Math.min(1, e * 2), 1 - x),
        transform: `translate(${tx}px, ${ty}px) scale(${sc * drift})`,
        filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Efecto de sonido que suena en el frame `at`. `lead` recorta silencio inicial (frames). */
export const Sfx: React.FC<{ name: string; at: number; volume?: number; lead?: number }> = ({
  name,
  at,
  volume = 0.4,
  lead = 0,
}) => (
  <Sequence from={Math.max(0, at)} durationInFrames={80} layout="none">
    <Audio
      src={staticFile(`sfx/${name}.mp3`)}
      volume={(f) => volume * (speaking(Math.max(0, at) + f) ? 0.5 : 1)}
      trimBefore={lead || undefined}
    />
  </Sequence>
);

/** Fondo azul noche con dos luces difusas que se mueven despacio. */
export const Background: React.FC<{ warm?: number }> = ({ warm = 0 }) => {
  const frame = useCurrentFrame();
  const a = Math.sin(frame / 50) * 120;
  const b = Math.cos(frame / 65) * 140;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 30%, ${C.navy} 0%, ${C.night} 70%)` }}>
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: -250 + a,
          top: 150 + b,
          borderRadius: "50%",
          background: C.blue,
          opacity: 0.35,
          filter: "blur(160px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          right: -300 - a,
          bottom: 100 - b,
          borderRadius: "50%",
          background: C.orange,
          opacity: 0.12 + warm * 0.25,
          filter: "blur(170px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: FLOOR,
          height: 3,
          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 20%, rgba(255,255,255,0.18) 80%, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Ráfaga de partículas que sale de (x, y) en el frame `at`. */
export const Burst: React.FC<{
  at: number;
  x: number;
  y: number;
  color?: string;
  count?: number;
  radius?: number;
  seed?: number;
}> = ({ at, x, y, color = C.orange, count = 14, radius = 260, seed = 1 }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 26) return null;
  const p = Easing.out(Easing.cubic)(Math.min(1, t / 20));
  const fade = interpolate(t, [10, 26], [1, 0], clamp);
  return (
    <svg
      width={radius * 3}
      height={radius * 3}
      viewBox={`${-radius * 1.5} ${-radius * 1.5} ${radius * 3} ${radius * 3}`}
      style={{ position: "absolute", left: x - radius * 1.5, top: y - radius * 1.5, overflow: "visible" }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const r = ((Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) % 1;
        const ang = (i / count) * Math.PI * 2 + r * 0.5;
        const d = radius * (0.55 + r * 0.6) * p;
        const len = 26 * (1 - p) + 6;
        const cx = Math.cos(ang) * d;
        const cy = Math.sin(ang) * d;
        return i % 2 === 0 ? (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(ang) * len}
            y2={cy + Math.sin(ang) * len}
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            opacity={fade}
          />
        ) : (
          <circle key={i} cx={cx} cy={cy} r={7 + r * 7} fill={i % 3 === 0 ? C.white : color} opacity={fade} />
        );
      })}
    </svg>
  );
};

/** Muñeco como los del logo: cabeza redonda y cuerpo en arco. */
export const Person: React.FC<{
  x: number;
  y?: number;
  size?: number;
  color?: "orange" | "blue" | "grey";
  ghost?: boolean;
  frown?: boolean;
  bob?: number;
  rotate?: number;
  opacity?: number;
  squash?: number; // >0 aplasta, <0 estira
}> = ({ x, y = FLOOR, size = 1, color = "orange", ghost = false, frown = false, bob = 0, rotate = 0, opacity = 1, squash = 0 }) => {
  const frame = useCurrentFrame();
  const id = `g-${color}`;
  const [top, bottom] =
    color === "orange" ? [C.orangeLight, C.orange] : color === "blue" ? [C.blueLight, C.blue] : ["#AEB8C8", "#6E7A8E"];
  const w = 120 * size;
  const h = 200 * size;
  const dy = bob ? Math.sin(frame / 7 + bob) * 5 : 0;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 200"
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h + dy,
        opacity,
        transform: `rotate(${rotate}deg) scale(${1 + squash * 0.25}, ${1 - squash * 0.25})`,
        transformOrigin: "50% 100%",
        overflow: "visible",
      }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      {ghost ? (
        <g fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="4" strokeDasharray="10 9">
          <circle cx="60" cy="40" r="32" />
          <path d="M12 198 V132 a48 48 0 0 1 96 0 V198" />
        </g>
      ) : (
        <g fill={`url(#${id})`}>
          <circle cx="60" cy="40" r="34" />
          <path d="M10 200 V132 a50 50 0 0 1 100 0 V200 Z" />
          {frown && (
            <g stroke={C.night} strokeWidth="5" strokeLinecap="round" fill="none">
              <path d="M44 30 l10 5 M76 30 l-10 5" />
              <path d="M46 58 q14 -12 28 0" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
};

/** Puerta del negocio con el cartel colgante (flip: 0 = ABIERTO, 1 = `back`). */
export const Door: React.FC<{ x?: number; flip?: number; back?: string; enter?: number; lit?: number }> = ({
  x = 760,
  flip = 0,
  back = "VACACIONES",
  enter = 1,
  lit = 1,
}) => {
  const w = 300;
  const h = 520;
  const signFront = flip < 0.5;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: FLOOR - h,
        width: w,
        height: h,
        transform: `translateY(${(1 - enter) * 60}px)`,
        opacity: enter,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -80,
          borderRadius: 40,
          background: C.blueLight,
          opacity: 0.18 * lit,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "26px 26px 0 0",
          border: `10px solid ${C.blueLight}`,
          borderBottom: "none",
          background: `linear-gradient(180deg, ${C.blue} 0%, ${C.navy} 100%)`,
          boxShadow: `inset 0 0 60px rgba(0,0,0,0.35)`,
          filter: `brightness(${0.45 + lit * 0.55})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 45,
          right: 45,
          top: 45,
          height: 170,
          borderRadius: 14,
          background: `linear-gradient(160deg, rgba(255,255,255,${0.35 * lit}), rgba(255,255,255,0.04))`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 38,
          top: h * 0.56,
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: C.orangeLight,
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 240, display: "flex", justifyContent: "center", perspective: 800 }}>
        <div
          style={{
            transform: `rotateY(${flip * 180}deg)`,
            background: signFront ? C.white : C.orange,
            color: signFront ? C.navy : C.white,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 2,
            padding: "14px 22px",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          }}
        >
          <span style={{ display: "inline-block", transform: signFront ? "none" : "scaleX(-1)" }}>
            {signFront ? "ABIERTO" : back}
          </span>
        </div>
      </div>
    </div>
  );
};

type Tone = "white" | "orange" | "muted";
const toneColor: Record<Tone, string> = { white: C.white, orange: C.orange, muted: "rgba(255,255,255,0.72)" };

/** Palabra que entra con muelle en el frame `at`. `pop` = entra de golpe desde grande. */
export const Word: React.FC<{
  at: number;
  children: React.ReactNode;
  size?: number;
  tone?: Tone;
  weight?: number;
  pop?: boolean;
  strike?: number;
  underline?: number;
}> = ({ at, children, size = 110, tone = "white", weight = 800, pop = false, strike, underline }) => {
  const frame = useCurrentFrame();
  const s = useSpring(at, pop ? { damping: 9, stiffness: 240 } : { damping: 14, stiffness: 210 });
  const strikeP = strike === undefined ? 0 : interpolate(frame, [strike, strike + 7], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const lineP =
    underline === undefined ? 0 : interpolate(frame, [underline, underline + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const blur = pop ? 0 : Math.max(0, (1 - s) * 10);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        fontFamily: FONT,
        fontSize: size,
        fontWeight: weight,
        color: toneColor[tone],
        lineHeight: 1.02,
        letterSpacing: "-0.03em",
        marginRight: size * 0.24,
        opacity: interpolate(s, [0, 0.35], [0, 1], clamp),
        transform: pop
          ? `scale(${interpolate(s, [0, 1], [2.4, 1])}) rotate(${(1 - s) * -6}deg)`
          : `translateY(${(1 - s) * 70}px) scale(${0.86 + s * 0.14})`,
        filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
        textShadow: tone === "orange" ? `0 0 44px rgba(254,100,22,0.5)` : "0 6px 30px rgba(0,0,0,0.35)",
      }}
    >
      {children}
      {underline !== undefined && (
        <svg
          viewBox="0 0 400 40"
          preserveAspectRatio="none"
          style={{ position: "absolute", left: "2%", bottom: -size * 0.12, width: "96%", height: size * 0.2, overflow: "visible" }}
        >
          <path
            d="M6 28 C 90 8, 220 6, 394 18"
            fill="none"
            stroke={C.white}
            strokeWidth={10}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - lineP}
          />
        </svg>
      )}
      {strike !== undefined && (
        <span
          style={{
            position: "absolute",
            left: -8,
            top: "52%",
            height: size * 0.11,
            width: `calc(${strikeP * 100}% + 16px)`,
            background: C.white,
            borderRadius: 99,
            transform: "rotate(-4deg)",
          }}
        />
      )}
    </span>
  );
};

export const Br = () => <div style={{ flexBasis: "100%", height: 0 }} />;

/** Bloque de texto centrado en la zona superior. */
export const TextBlock: React.FC<{ top?: number; children: React.ReactNode }> = ({ top = 300, children }) => (
  <div
    style={{
      position: "absolute",
      left: 80,
      right: 80,
      top,
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "baseline",
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

/** Líneas de velocidad horizontales. */
export const SpeedLines: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const o = interpolate(frame, [from, from + 4, to - 6, to], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const y = 1080 + ((i * 97) % 380);
        const speed = 90 + (i % 4) * 30;
        const x = ((frame - from) * speed + i * 211) % 1600 - 400;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 180 + (i % 3) * 80,
              height: 5,
              borderRadius: 9,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55))",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const rand = (i: number, seed = 0) => (((Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1) + 1) % 1;
const CONFETTI = [C.orange, C.orangeLight, C.blueLight, C.white, "#FFD23F", C.blue];

/** Lluvia continua de confeti entre `from` y `to`. */
export const ConfettiRain: React.FC<{ from: number; to: number; count?: number; seed?: number }> = ({
  from,
  to,
  count = 46,
  seed = 3,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const o = interpolate(frame, [from, from + 6, to - 8, to], [0, 1, 1, 0], clamp);
  const t = frame - from;
  return (
    <AbsoluteFill style={{ opacity: o, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const speed = 7 + rand(i, seed) * 9;
        const y = ((t * speed + rand(i, seed + 1) * 2200) % 2200) - 200;
        const x = rand(i, seed + 2) * 1080 + Math.sin((t + i * 9) / 11) * 40;
        const spin = t * (4 + rand(i, seed + 3) * 8) + i * 40;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 18,
              height: 30,
              borderRadius: 4,
              background: CONFETTI[i % CONFETTI.length],
              transform: `rotate(${spin}deg) scaleX(${Math.cos(spin / 20)})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Cañón de confeti con gravedad desde (x, y) hacia `angle` grados (0 = arriba). */
export const ConfettiCannon: React.FC<{ at: number; x: number; y: number; angle: number; count?: number; seed?: number }> = ({
  at,
  x,
  y,
  angle,
  count = 40,
  seed = 5,
}) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 70) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const a = ((angle + (rand(i, seed) - 0.5) * 50) * Math.PI) / 180;
        const v = 38 + rand(i, seed + 1) * 34;
        const drag = Math.exp(-t / 22);
        const dist = v * 22 * (1 - drag);
        const px = x + Math.sin(a) * dist;
        const py = y - Math.cos(a) * dist + 0.9 * t * t * 0.35;
        const spin = t * (10 + rand(i, seed + 2) * 14);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: 20,
              height: 34,
              borderRadius: 4,
              background: CONFETTI[i % CONFETTI.length],
              opacity: interpolate(t, [50, 70], [1, 0], clamp),
              transform: `rotate(${spin}deg) scaleX(${Math.cos(spin / 18)})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Lluvia triste. */
export const Rain: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      {Array.from({ length: 70 }).map((_, i) => {
        const speed = 55 + rand(i, 31) * 30;
        const y = ((frame * speed + rand(i, 32) * 2100) % 2100) - 150;
        const x = rand(i, 33) * 1180 - (y * 0.18);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 3,
              height: 70 + rand(i, 34) * 50,
              background: "linear-gradient(180deg, transparent, rgba(180,210,255,0.55))",
              transform: "rotate(10deg)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Bola de paja que cruza el suelo rodando. */
export const Tumbleweed: React.FC<{ from: number; duration: number }> = ({ from, duration }) => {
  const frame = useCurrentFrame();
  const t = frame - from;
  if (t < 0 || t > duration) return null;
  const p = t / duration;
  const x = interpolate(p, [0, 1], [-160, 1240]);
  const hop = Math.abs(Math.sin(p * Math.PI * 4)) * 70 * (1 - p * 0.4);
  return (
    <svg
      width="150"
      height="150"
      viewBox="-75 -75 150 150"
      style={{ position: "absolute", left: x - 75, top: FLOOR - 150 - hop, transform: `rotate(${t * 14}deg)` }}
    >
      <g fill="none" stroke="#B08A5E" strokeWidth="5" strokeLinecap="round" opacity="0.9">
        <ellipse rx="66" ry="60" />
        <ellipse rx="50" ry="62" transform="rotate(35)" />
        <ellipse rx="62" ry="40" transform="rotate(-25)" />
        <ellipse rx="34" ry="56" transform="rotate(70)" />
        <path d="M-50 -10 Q0 30 52 -6 M-30 40 Q10 -40 40 36" />
      </g>
    </svg>
  );
};

/** Rayos de luz girando detrás de un punto. */
export const LightRays: React.FC<{ x: number; y: number; opacity?: number; color?: string }> = ({
  x,
  y,
  opacity = 1,
  color = "rgba(255,255,255,0.10)",
}) => {
  const frame = useCurrentFrame();
  const size = 2200;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        opacity,
        transform: `rotate(${frame * 0.5}deg)`,
        background: `repeating-conic-gradient(from 0deg, ${color} 0deg 7deg, transparent 7deg 20deg)`,
        WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 60%)",
        maskImage: "radial-gradient(circle, black 0%, transparent 60%)",
      }}
    />
  );
};

/**
 * Música de un tramo: suena entre `from` y `to` (frames absolutos), con fundidos y
 * bajando de volumen mientras habla la voz (`speaking(frame)`).
 */
export const Music: React.FC<{
  name: string;
  from: number;
  to: number;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
  speaking: (frame: number) => boolean;
}> = ({ name, from, to, volume, fadeIn = 2, fadeOut = 6, speaking }) => (
  <Sequence from={from} durationInFrames={to - from} layout="none">
    <Audio
      src={staticFile(`music/${name}.mp3`)}
      volume={(f) => {
        const abs = from + f;
        const env = interpolate(f, [0, fadeIn, to - from - fadeOut, to - from], [0, 1, 1, 0], clamp);
        return volume * env * (speaking(abs) ? 0.4 : 1);
      }}
    />
  </Sequence>
);
