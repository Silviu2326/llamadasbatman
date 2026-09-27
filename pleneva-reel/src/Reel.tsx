import React from "react";
import { AbsoluteFill, Audio, Easing, Freeze, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  Background,
  Br,
  Burst,
  ConfettiCannon,
  ConfettiRain,
  Door,
  LightRays,
  Music,
  Rain,
  Tumbleweed,
  Person,
  Scene,
  Sfx,
  SpeedLines,
  TextBlock,
  Word,
  clamp,
  useKick,
  useShake,
  useSpring,
} from "./components";
import { C, DURATION, FLOOR, FONT, VOICE_END, at, speaking } from "./theme";

// Momentos clave de la locución (frames).
const T = {
  cola: at("cola", 0),
  que: at("¿qué"),
  cambiarias: at("cambiarías"),
  sub: at("subirías"),
  precios: at("precios"),
  dir: at("dirías"),
  no: at("no", 0),
  amargan: at("amargan"),
  con: at("contratarías"),
  te: at("te", 1),
  vacaciones: at("vacaciones"),
  y: at("¿y"),
  ya: at("ya"),
  porque: at("porque"),
  cola2: at("cola", 1),
  la3: at("la", 2),
  cola3: at("cola", 2),
  ponemos: at("ponemos"),
  pleneva: at("pleneva"),
  traemos: at("te", 3),
};
const cut = (f: number) => f - 4;
/** La escena siguiente entra antes de que la anterior termine de salir. */
const OVERLAP = 6;

const QUEUE_X = [560, 420, 280, 140, 0];
const STAMP_HIT = T.no + 6;
const COUNT_END = T.precios + 20;
const HIRE = [0, 5, 10].map((d) => T.con + 2 + d);
const HIRE_LAND = 7;
/** Rayado de disco: la euforia se congela justo antes de «¿Y por qué…?». */
const FREEZE = T.y - 11;
/** Latidos visuales en la escena de tensión. */
const BEATS = [FREEZE + 3, FREEZE + 14];

const QueuePerson: React.FC<{ x: number; delay: number; bob: number; size?: number; from?: number; party?: boolean }> = ({
  x,
  delay,
  bob,
  size = 1,
  from = -500,
  party = false,
}) => {
  const frame = useCurrentFrame();
  const s = useSpring(delay, { damping: 15, stiffness: 120 });
  const px = interpolate(s, [0, 1], [from, x]);
  const hop = Math.abs(Math.sin(Math.min(s, 1) * Math.PI * 3)) * 26 * (1 - s);
  // Celebración: saltos desfasados cuando ya han llegado.
  const t = frame - delay - 14;
  const phase = party && t > 0 ? Math.sin((t + bob * 3) / 3.2) : 0;
  const jump = phase > 0 ? phase * 55 * size : 0;
  const land = phase < 0 ? -phase * 0.35 : 0;
  return (
    <Person
      x={px}
      y={FLOOR - hop - jump}
      size={size}
      bob={party ? 0 : bob}
      opacity={s > 0.01 ? 1 : 0}
      squash={(1 - s) * -0.4 + land - (jump > 0 ? 0.12 : 0)}
    />
  );
};

/* 1 · Gancho: la cola en la puerta */
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [T.que - 3, T.que + 6], [0, 1], clamp);
  const qPulse = frame > T.cambiarias + 10 ? 1 + Math.sin((frame - T.cambiarias) / 3.2) * 0.025 : 1;
  return (
    <>
      <Door />
      {QUEUE_X.map((x, i) => (
        <QueuePerson key={i} x={x} delay={i * 3 - 14} bob={i} from={-420 - i * 60} />
      ))}
      <div style={{ opacity: 1 - out, transform: `translateY(${-90 * out}px)`, filter: out > 0.05 ? `blur(${out * 10}px)` : undefined }}>
        <TextBlock top={230}>
          <Word at={-6} size={92} tone="muted">Si</Word>
          <Word at={at("mañana") - 3} size={92} tone="muted">mañana</Word>
          <Word at={at("tuvieras") - 2} size={92} tone="muted">tuvieras</Word>
          <Br />
          <Word at={T.cola} size={270} tone="orange" weight={900} pop underline={T.cola + 7}>cola</Word>
          <Br />
          <Word at={at("en")} size={92}>en</Word>
          <Word at={at("la", 0)} size={92}>la</Word>
          <Word at={at("puerta")} size={92}>puerta…</Word>
        </TextBlock>
      </div>
      <Burst at={T.cola + 2} x={540} y={480} radius={240} count={12} seed={2} />
      <div style={{ position: "absolute", inset: 0, transform: `scale(${qPulse})`, transformOrigin: "50% 25%" }}>
        <TextBlock top={330}>
          <Word at={T.que} size={150} weight={900}>¿Qué</Word>
          <Br />
          <Word at={T.cambiarias} size={150} weight={900} tone="orange" pop>cambiarías?</Word>
        </TextBlock>
      </div>
    </>
  );
};

/* 2 · Subirías precios */
const Prices: React.FC = () => {
  const frame = useCurrentFrame();
  const tag = useSpring(T.sub, { damping: 11 });
  const value = Math.round(
    interpolate(frame, [T.precios, COUNT_END], [49, 89], { ...clamp, easing: Easing.out(Easing.cubic) }),
  );
  const arrow = useSpring(T.precios, { damping: 10 });
  const bump = useSpring(COUNT_END, { damping: 7, stiffness: 300 });
  const wobble = frame < COUNT_END ? Math.sin(frame * 1.6) * 2 : 0;
  return (
    <>
      <TextBlock top={300}>
        <Word at={T.sub} size={130}>Subirías</Word>
        <Br />
        <Word at={T.precios} size={170} weight={900} tone="orange" pop>precios.</Word>
      </TextBlock>
      <div
        style={{
          position: "absolute",
          left: 540 - 300,
          top: 880,
          width: 600,
          height: 340,
          transform: `scale(${tag * (1 + (bump > 0 ? Math.sin(bump * Math.PI) * 0.08 : 0))}) rotate(${-8 + (1 - tag) * 30 + wobble}deg)`,
          borderRadius: "40px 150px 150px 40px",
          background: `linear-gradient(135deg, ${C.orangeLight}, ${C.orange})`,
          boxShadow: "0 40px 80px rgba(0,0,0,0.45), 0 0 90px rgba(254,100,22,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "absolute", right: 70, top: 145, width: 50, height: 50, borderRadius: "50%", background: C.night }} />
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 190,
            color: C.white,
            marginRight: 80,
            letterSpacing: "-0.04em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}€
        </span>
      </div>
      <Burst at={COUNT_END} x={540} y={1050} radius={380} count={18} seed={4} color={C.orangeLight} />
      <svg
        width="200"
        height="300"
        viewBox="0 0 200 300"
        style={{
          position: "absolute",
          left: 790,
          top: 690,
          transform: `translateY(${(1 - arrow) * 220 + Math.sin(frame / 5) * 8}px) scale(${arrow})`,
          opacity: arrow,
        }}
      >
        <path d="M100 10 L185 120 H130 V290 H70 V120 H15 Z" fill={C.white} />
      </svg>
    </>
  );
};

/* 3 · Dirías que no a los clientes que te amargan */
const SayNo: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = useSpring(T.dir, { damping: 14 });
  const stampT = interpolate(frame, [T.no, STAMP_HIT], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const shake = useShake(STAMP_HIT, 30);
  const leave = interpolate(frame, [T.amargan + 12, T.amargan + 24], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.back(1.6)),
  });
  const squash = interpolate(frame, [STAMP_HIT, STAMP_HIT + 2, STAMP_HIT + 7, STAMP_HIT + 12], [0, 0.6, -0.15, 0], clamp);
  const w = ["Dirías", "que", "no", "a", "los", "clientes", "que", "te", "amargan."];
  const counts: Record<string, number> = {};
  return (
    <div style={{ position: "absolute", inset: 0, transform: shake }}>
      <TextBlock top={250}>
        {w.map((word, i) => {
          const key = word.replace(".", "");
          const n = counts[key] ?? 0;
          counts[key] = n + 1;
          const hot = word === "no" || word === "amargan.";
          return (
            <Word key={i} at={at(key, n)} size={96} tone={hot ? "orange" : "white"} weight={hot ? 900 : 800}>
              {word}
            </Word>
          );
        })}
      </TextBlock>
      <Person
        x={interpolate(leave, [0, 1], [540, -380])}
        y={FLOOR + (1 - enter) * 300 - leave * 160}
        size={2.1}
        color="grey"
        frown
        rotate={-40 * leave}
        opacity={enter}
        squash={squash}
      />
      {frame >= T.no && (
        <div
          style={{
            position: "absolute",
            left: 540 - 270,
            top: 760,
            width: 540,
            height: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `18px solid ${C.orange}`,
            borderRadius: 36,
            color: C.orange,
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 250,
            letterSpacing: "0.02em",
            transform: `rotate(-14deg) scale(${interpolate(stampT, [0, 1], [3.4, 1])})`,
            opacity: interpolate(stampT, [0, 0.3], [0, 1], clamp),
            background: "rgba(0,13,37,0.55)",
            boxShadow: "0 0 80px rgba(254,100,22,0.45)",
          }}
        >
          NO
        </div>
      )}
      <Burst at={STAMP_HIT} x={540} y={910} radius={420} count={20} seed={7} />
    </div>
  );
};

/* 4 · Contratarías */
const Hire: React.FC = () => (
  <>
    {[300, 540, 780].map((x, i) => (
      <TeamMember key={x} x={x} start={HIRE[i]} i={i} />
    ))}
    <TextBlock top={360}>
      <Word at={T.con} size={124} weight={900} pop>Contratarías.</Word>
    </TextBlock>
  </>
);

const TeamMember: React.FC<{ x: number; start: number; i: number }> = ({ x, start, i }) => {
  const frame = useCurrentFrame();
  const fall = interpolate(frame, [start, start + HIRE_LAND], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const land = start + HIRE_LAND;
  const squash = interpolate(frame, [start, land - 1, land, land + 3, land + 7, land + 11], [-0.35, -0.35, 0.6, -0.2, 0.08, 0], clamp);
  const plus = interpolate(frame, [land + 1, land + 22], [0, 1], clamp);
  return (
    <>
      <Person x={x} y={FLOOR - (1 - fall) * 1100} size={1.7} color="blue" bob={frame > land + 11 ? i + 2 : 0} squash={squash} opacity={frame >= start ? 1 : 0} />
      <Burst at={land} x={x} y={FLOOR - 10} radius={150} count={10} seed={i + 11} color={C.blueLight} />
      <div
        style={{
          position: "absolute",
          left: x - 80,
          width: 160,
          top: FLOOR - 440 - Easing.out(Easing.cubic)(plus) * 110,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 80,
          color: C.orange,
          transform: `scale(${interpolate(plus, [0, 0.15, 0.3], [0.2, 1.3, 1], clamp)})`,
          opacity: plus > 0 ? 1 : 0,
          textShadow: "0 0 30px rgba(254,100,22,0.5)",
        }}
      >
        +1
      </div>
    </>
  );
};

/* 5 · Te cogerías vacaciones */
const Holidays: React.FC = () => {
  const frame = useCurrentFrame();
  const flip = interpolate(frame, [T.vacaciones, T.vacaciones + 12], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const rise = useSpring(T.te - 4, { damping: 18, stiffness: 70 });
  const sunY = interpolate(rise, [0, 1], [1500, 1020]);
  return (
    <>
      <Background warm={rise} />
      <div style={{ position: "absolute", left: 310 - 260, top: sunY - 260, width: 520, height: 520 }}>
        <svg width="520" height="520" viewBox="-260 -260 520 520" style={{ transform: `rotate(${frame * 1.2}deg) scale(${0.9 + Math.sin(frame / 6) * 0.04})` }}>
          {Array.from({ length: 14 }).map((_, k) => (
            <rect key={k} x={-12} y={-250} width={24} height={70} rx={12} fill={C.orangeLight} transform={`rotate(${(360 / 14) * k})`} />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            left: 110,
            top: 110,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, #FFD27A, ${C.orange})`,
            boxShadow: "0 0 120px rgba(254,140,40,0.7)",
          }}
        />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: FLOOR, bottom: 0, background: C.night }} />
      <Door flip={flip} back="VACACIONES" />
      <TextBlock top={290}>
        <Word at={T.te} size={110}>Te</Word>
        <Word at={at("cogerías")} size={110}>cogerías</Word>
        <Br />
        <Word at={T.vacaciones} size={140} weight={900} tone="orange" pop>vacaciones.</Word>
      </TextBlock>
      <Burst at={T.vacaciones + 2} x={540} y={470} radius={340} count={16} seed={9} color={C.orangeLight} />
    </>
  );
};

/* 6 · ¿Y por qué no lo haces ya? */
const WhyNot: React.FC = () => {
  const frame = useCurrentFrame();
  const shake = useShake(T.ya + 2, 20);
  const clock = useSpring(T.y, { damping: 16 });
  const hand = (frame - T.y) * 14;
  const creep = interpolate(frame, [T.y, T.porque], [1, 1.1], clamp);
  const beat = Math.max(0, ...BEATS.map((b) => (frame >= b ? Math.exp(-(frame - b) / 4) : 0)));
  return (
    <div style={{ position: "absolute", inset: 0, transform: `${shake === "none" ? "" : shake} scale(${creep + beat * 0.03})` }}>
      <AbsoluteFill style={{ background: "rgba(0,8,24,0.72)" }} />
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(220,40,40,0.55), transparent 65%)",
          opacity: beat * 0.8,
        }}
      />
      <svg
        width="900"
        height="900"
        viewBox="-450 -450 900 900"
        style={{ position: "absolute", left: 90, top: 480, opacity: 0.16 * clock, transform: `scale(${0.8 + clock * 0.2})` }}
      >
        <circle r="420" fill="none" stroke={C.white} strokeWidth="10" />
        {Array.from({ length: 12 }).map((_, k) => (
          <rect key={k} x={-6} y={-410} width={12} height={k % 3 === 0 ? 60 : 32} rx={6} fill={C.white} transform={`rotate(${k * 30})`} />
        ))}
        <rect x={-7} y={-330} width={14} height={340} rx={7} fill={C.orange} transform={`rotate(${hand})`} />
        <circle r="22" fill={C.orange} />
      </svg>
      <TextBlock top={560}>
        <Word at={T.y} size={140}>¿Y</Word>
        <Word at={at("por")} size={140}>por</Word>
        <Word at={at("qué", 1)} size={140}>qué</Word>
        <Br />
        <Word at={at("no", 1)} size={140}>no</Word>
        <Word at={at("lo")} size={140}>lo</Word>
        <Word at={at("haces")} size={140}>haces</Word>
        <Br />
        <Word at={T.ya} size={260} weight={900} tone="orange" pop>ya?</Word>
      </TextBlock>
      <Burst at={T.ya + 2} x={540} y={1060} radius={360} count={18} seed={13} />
    </div>
  );
};

/* 7 · Porque no tienes la cola */
const NoQueue: React.FC = () => {
  const frame = useCurrentFrame();
  const flicker = [3, 4, 9, 15, 16].includes(frame - T.porque) ? 0.25 : 1;
  const lit = interpolate(frame, [T.porque, T.porque + 4, T.cola2 + 10], [1, 0.55, 0.2], clamp) * flicker;
  return (
    <>
      <AbsoluteFill style={{ background: `rgba(0,6,20,${0.15 + (1 - lit) * 0.5})` }} />
      <Rain opacity={interpolate(frame, [T.porque, T.porque + 10], [0, 0.8], clamp)} />
      <Tumbleweed from={T.porque + 6} duration={52} />
      {/* foco sobre la puerta */}
      <div
        style={{
          position: "absolute",
          left: 760 - 330,
          top: 820,
          width: 660,
          height: 660,
          background: "radial-gradient(ellipse at 50% 0%, rgba(120,180,255,0.35), transparent 70%)",
          clipPath: "polygon(40% 0, 60% 0, 100% 100%, 0 100%)",
          opacity: lit,
        }}
      />
      <Door lit={lit} />
      {QUEUE_X.map((x, i) => {
        const fade = interpolate(frame, [T.porque + 4 + i * 4, T.porque + 14 + i * 4], [1, 0], clamp);
        return <Person key={i} x={x} ghost opacity={fade} y={FLOOR + (1 - fade) * 20} />;
      })}
      <TextBlock top={290}>
        <Word at={T.porque} size={105}>Porque</Word>
        <Word at={at("no", 2)} size={105}>no</Word>
        <Word at={at("tienes")} size={105}>tienes</Word>
        <Br />
        <Word at={at("la", 1)} size={160} weight={900}>la</Word>
        <Word at={T.cola2} size={220} weight={900} tone="orange" pop strike={T.cola2 + 9}>
          cola.
        </Word>
      </TextBlock>
    </>
  );
};

/* 8 · La cola te la ponemos nosotros */
const WeBringIt: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = interpolate(frame, [T.cola3, T.cola3 + 3, T.cola3 + 14], [0, 0.55, 0], clamp);
  const citas = Math.round(interpolate(frame, [T.cola3 + 4, T.pleneva - 4], [0, 24], clamp));
  const chip = useSpring(T.ponemos, { damping: 12 });
  const row1 = Array.from({ length: 11 }, (_, i) => 580 - i * 118);
  const row2 = Array.from({ length: 10 }, (_, i) => 520 - i * 118);
  return (
    <>
      <Background warm={0.8} />
      <Door />
      <SpeedLines from={T.cola3 - 2} to={T.cola3 + 24} />
      {row2.map((x, i) => (
        <div key={`b${i}`} style={{ position: "absolute", inset: 0, filter: "brightness(0.62)" }}>
          <QueuePerson x={x} delay={T.cola3 + 1 + i * 2} bob={i + 0.5} size={0.82} from={-1000} party />
        </div>
      ))}
      {row1.map((x, i) => (
        <QueuePerson key={`a${i}`} x={x} delay={T.cola3 - 2 + i * 2} bob={i} from={-1000} party />
      ))}
      <AbsoluteFill style={{ background: C.orange, opacity: flash, mixBlendMode: "screen" }} />
      <TextBlock top={250}>
        <Word at={T.la3} size={130} weight={900}>La</Word>
        <Word at={T.cola3} size={250} weight={900} tone="orange" pop underline={T.cola3 + 6}>cola</Word>
        <Br />
        <Word at={at("te", 2)} size={92}>te</Word>
        <Word at={at("la", 3)} size={92}>la</Word>
        <Word at={T.ponemos} size={92}>ponemos</Word>
        <Word at={at("nosotros")} size={92} tone="orange">nosotros.</Word>
      </TextBlock>
      <Burst at={T.cola3 + 2} x={640} y={380} radius={380} count={20} seed={17} />
      <ConfettiCannon at={T.cola3} x={-20} y={1750} angle={28} count={44} seed={41} />
      <ConfettiCannon at={T.cola3 + 2} x={1100} y={1750} angle={-28} count={44} seed={43} />
      <div
        style={{
          position: "absolute",
          left: 540 - 250,
          width: 500,
          top: 770,
          transform: `scale(${chip * (citas > 0 && frame % 4 < 2 && citas < 24 ? 1.02 : 1)})`,
          opacity: chip,
          background: "rgba(255,255,255,0.1)",
          border: "2px solid rgba(255,255,255,0.25)",
          borderRadius: 999,
          padding: "22px 34px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          fontFamily: FONT,
          color: C.white,
          fontWeight: 700,
          fontSize: 44,
        }}
      >
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1DB954", boxShadow: "0 0 18px #1DB954" }} />
        Agenda:
        <span style={{ color: C.orange, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{citas} citas</span>
      </div>
    </>
  );
};

/* 9 · Logo */
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = useSpring(T.pleneva, { damping: 11, stiffness: 110 });
  const wipe = interpolate(frame, [T.traemos, T.traemos + 20], [100, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const shine = interpolate(frame, [T.pleneva + 12, T.pleneva + 36], [130, -30], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cta = useSpring(VOICE_END + 4, { damping: 10 });
  const glow = 0.5 + Math.sin(frame / 10) * 0.15;
  const src = staticFile("pleneva-logo-stacked-dark.png");
  const box: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: 880, height: 665 };
  const mask: React.CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    WebkitMaskSize: "100% 100%",
    maskImage: `url(${src})`,
    maskSize: "100% 100%",
  };
  return (
    <>
      <Background warm={0.6} />
      <LightRays x={540} y={780} opacity={logo} />
      <ConfettiRain from={T.pleneva} to={DURATION + 5} count={30} seed={51} />
      <div
        style={{
          position: "absolute",
          left: 540 - 330,
          top: 520,
          width: 660,
          height: 500,
          borderRadius: "50%",
          background: C.blue,
          opacity: glow * logo,
          filter: "blur(140px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 470,
          width: 880,
          height: 665,
          transform: `scale(${0.35 + logo * 0.65}) rotate(${(1 - logo) * -14}deg)`,
          opacity: Math.min(1, logo * 1.6),
          filter: logo < 0.9 ? `blur(${(1 - logo) * 14}px)` : undefined,
        }}
      >
        <Img src={src} style={{ ...box, clipPath: "inset(0 0 14% 0)" }} />
        <Img src={src} style={{ ...box, clipPath: `inset(86% ${wipe}% 0 0)` }} />
        <div
          style={{
            ...box,
            ...mask,
            clipPath: "inset(0 0 14% 0)",
            background: `linear-gradient(105deg, transparent ${shine - 12}%, rgba(255,255,255,0.75) ${shine}%, transparent ${shine + 12}%)`,
          }}
        />
      </div>
      <Burst at={T.pleneva + 8} x={540} y={760} radius={480} count={22} seed={21} color={C.orangeLight} />
      <Burst at={T.pleneva + 12} x={540} y={760} radius={340} count={16} seed={23} color={C.blueLight} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1250,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${(1 - cta) * 80}px) scale(${0.7 + cta * 0.3})`,
          opacity: Math.min(1, cta * 1.5),
        }}
      >
        <div
          style={{
            background: C.orange,
            color: C.white,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 52,
            padding: "26px 56px",
            borderRadius: 999,
            boxShadow: `0 20px 60px rgba(254,100,22,${0.35 + Math.sin(frame / 6) * 0.15})`,
          }}
        >
          Enlace en la bio
        </div>
      </div>
    </>
  );
};

type Stem = "all" | "voice" | "bg";

const Sound: React.FC<{ stem: Stem }> = ({ stem }) => (
  <>
    {stem !== "bg" && <Audio src={staticFile("voice.mp3")} />}
    {stem !== "voice" && <BackgroundSound />}
  </>
);

const BackgroundSound: React.FC = () => (
  <>
    {/* Música por emoción */}
    <Music name="tension" from={0} to={T.sub} volume={0.2} fadeOut={4} speaking={speaking} />
    <Music name="euphoria" from={T.sub - 2} to={FREEZE + 1} volume={0.18} fadeOut={1} speaking={speaking} />
    <Music name="sad" from={T.porque} to={T.cola3} volume={0.24} fadeIn={6} fadeOut={10} speaking={speaking} />
    <Music name="triumph" from={T.cola3} to={DURATION} volume={0.2} fadeIn={1} fadeOut={20} speaking={speaking} />

    {/* 1 · intriga */}
    <Sfx name="steps" at={0} volume={0.35} lead={8} />
    <Sfx name="pop" at={T.cola} volume={0.45} />
    <Sfx name="boom" at={T.cola} volume={0.3} />
    <Sfx name="pop" at={T.cambiarias} volume={0.35} />
    <Sfx name="heartbeat" at={T.cambiarias + 6} volume={0.45} />
    <Sfx name="riser" at={T.sub - 36} volume={0.3} />

    {/* 2-5 · euforia */}
    {[T.sub, T.dir, T.con, T.te, T.porque].map((f) => (
      <Sfx key={f} name="whoosh" at={cut(f) - 3} volume={0.28} />
    ))}
    <Sfx name="pop" at={T.precios} volume={0.35} />
    <Sfx name="cash" at={COUNT_END - 2} volume={0.45} />
    <Sfx name="stamp" at={STAMP_HIT - 1} volume={0.35} />
    <Sfx name="whoosh" at={T.amargan + 14} volume={0.35} />
    <Sfx name="boing" at={T.amargan + 17} volume={0.3} />
    {HIRE.map((f) => (
      <React.Fragment key={f}>
        <Sfx name="boing" at={f + HIRE_LAND} volume={0.3} />
        <Sfx name="ding" at={f + HIRE_LAND + 2} volume={0.22} />
      </React.Fragment>
    ))}
    <Sfx name="flip" at={T.vacaciones} volume={0.45} />
    <Sfx name="sparkle" at={T.vacaciones + 2} volume={0.35} />

    {/* 6 · frenazo y tensión */}
    <Sfx name="scratch" at={FREEZE} volume={0.6} />
    <Sfx name="heartbeat" at={FREEZE + 3} volume={0.3} />
    <Sfx name="clock" at={T.y + 2} volume={0.16} lead={7} />
    <Sfx name="subdrop" at={T.porque - 14} volume={0.35} />

    {/* 7 · tristeza */}
    <Sfx name="switch" at={T.porque} volume={0.3} lead={14} />
    <Sfx name="wind" at={T.porque + 6} volume={0.2} />
    <Sfx name="crickets" at={T.porque + 12} volume={0.22} />

    {/* 8 · explosión */}
    <Sfx name="riser" at={T.cola3 - 36} volume={0.3} />
    <Sfx name="rush" at={T.cola3 - 6} volume={0.22} />
    <Sfx name="boom" at={T.cola3} volume={0.22} />
    <Sfx name="confetti" at={T.cola3} volume={0.3} />
    <Sfx name="confetti" at={T.cola3 + 2} volume={0.22} />
    <Sfx name="cheer" at={at("nosotros") + 16} volume={0.2} />

    {/* 9 · marca */}
    <Sfx name="shimmer" at={T.pleneva} volume={0.4} />
    <Sfx name="sparkle" at={T.pleneva + 14} volume={0.3} />
    <Sfx name="pop" at={VOICE_END + 4} volume={0.4} />
  </>
);

/** Congela la escena en `at`, la pasa a gris y la sacude (rayado de disco). */
const FreezeAt: React.FC<{ at: number; children: React.ReactNode }> = ({ at: f, children }) => {
  const frame = useCurrentFrame();
  if (frame < f) return <>{children}</>;
  const t = frame - f;
  const g = interpolate(t, [0, 4], [0, 1], clamp);
  const jolt = t < 6 ? Math.sin(t * 3) * (6 - t) * 3 : 0;
  return (
    <AbsoluteFill
      style={{
        filter: `grayscale(${g}) contrast(${1 + g * 0.2})`,
        transform: `translateX(${jolt}px) rotate(${g * -2}deg) scale(${1 + g * 0.05})`,
      }}
    >
      <Freeze frame={f}>{children}</Freeze>
    </AbsoluteFill>
  );
};

/** Gradación de color por emoción. */
function useMood() {
  const frame = useCurrentFrame();
  const keys = [0, T.sub - 4, T.sub + 2, FREEZE, FREEZE + 4, T.y, T.porque, T.porque + 8, T.cola3 - 1, T.cola3 + 1, T.pleneva, DURATION];
  const pick = (vals: number[]) => interpolate(frame, keys, vals, clamp);
  return {
    sat: pick([0.9, 0.9, 1.3, 1.3, 1, 0.85, 0.8, 0.45, 0.45, 1.4, 1.15, 1.15]),
    bright: pick([0.95, 0.95, 1.05, 1.05, 1, 0.9, 0.9, 0.82, 0.82, 1.12, 1, 1]),
    vig: pick([0.6, 0.6, 0.15, 0.15, 0.5, 0.75, 0.75, 0.8, 0.8, 0.1, 0.3, 0.3]),
  };
}

/** Pulso al ritmo de la música alegre (124 bpm). */
function useBeat() {
  const frame = useCurrentFrame();
  if (frame < T.sub || frame > FREEZE) return 1;
  const beat = (30 * 60) / 124;
  const ph = ((frame - T.sub) % beat) / beat;
  return 1 + 0.014 * Math.pow(1 - ph, 6);
}

export const Reel: React.FC<{ stem?: Stem }> = ({ stem = "all" }) => {
  const kick = useKick([T.cola, COUNT_END, STAMP_HIT, T.vacaciones, T.ya, T.cola3, T.pleneva + 8]);
  const mood = useMood();
  const beat = useBeat();
  const scenes: [number, React.ReactNode, "push" | "drop" | "zoom" | "fade"][] = [
    [-10, <Hook key="hook" />, "fade"],
    [cut(T.sub), <Prices key="prices" />, "push"],
    [cut(T.dir), <SayNo key="no" />, "push"],
    [cut(T.con), <Hire key="hire" />, "drop"],
    [
      cut(T.te),
      <FreezeAt key="hol" at={FREEZE}>
        <Holidays />
      </FreezeAt>,
      "push",
    ],
    [cut(T.y), <WhyNot key="why" />, "zoom"],
    [cut(T.porque), <NoQueue key="noq" />, "fade"],
    [cut(T.la3), <WeBringIt key="bring" />, "zoom"],
    [cut(T.pleneva), <Outro key="outro" />, "zoom"],
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.night, fontFamily: FONT }}>
      <AbsoluteFill style={{ filter: `saturate(${mood.sat}) brightness(${mood.bright})` }}>
        <Background />
        <AbsoluteFill style={{ transform: `scale(${kick * beat})` }}>
          {scenes.map(([from, node, enter], i) => (
            <Scene key={i} from={from} to={i + 1 < scenes.length ? scenes[i + 1][0] + OVERLAP : DURATION + 5} enter={enter}>
              {node}
            </Scene>
          ))}
        </AbsoluteFill>
        <ConfettiRain from={T.sub} to={FREEZE} count={34} seed={3} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,0.85) 100%)",
          opacity: mood.vig,
          pointerEvents: "none",
        }}
      />
      <Sound stem={stem} />
    </AbsoluteFill>
  );
};
