import type { ReactNode } from "react";

/**
 * Premium line-icon registry (24x24, stroke = currentColor). Covers sales/CRM
 * concepts plus industry glyphs. Rendered site-wide via <Icon name="..." />.
 * Keep every entry a valid, self-contained set of SVG primitives.
 */
const PATHS: Record<string, ReactNode> = {
  // --- Channels & communication ---
  phone: <path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z" />,
  "phone-outbound": (
    <>
      <path d="M6.5 5h3l1.4 3.6-1.9 1.4a10 10 0 0 0 4.6 4.6l1.4-1.9L18.5 17.5v2.5a1.8 1.8 0 0 1-2 1.8A15 15 0 0 1 4.2 7 1.8 1.8 0 0 1 6.5 5z" />
      <path d="M15 8V4h4" />
      <path d="M19 4l-4.5 4.5" />
    </>
  ),
  "phone-incoming": (
    <>
      <path d="M6.5 5h3l1.4 3.6-1.9 1.4a10 10 0 0 0 4.6 4.6l1.4-1.9L18.5 17.5v2.5a1.8 1.8 0 0 1-2 1.8A15 15 0 0 1 4.2 7 1.8 1.8 0 0 1 6.5 5z" />
      <path d="M19 4v4h-4" />
      <path d="M15 8l4-4" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21M9 21h6" />
    </>
  ),
  waveform: <path d="M4 10v4M8 6.5v11M12 8.5v7M16 5v14M20 9.5v5" />,
  whatsapp: (
    <>
      <path d="M20 11.4a8 8 0 0 1-11.6 7.1L4 20l1.5-4.3A8 8 0 1 1 20 11.4z" />
      <path d="M9 8.7c0 3.5 2.5 5.2 4.3 5.8.6.2 1.2-.1 1.4-.7.2-.5-.1-.9-.5-1.1l-1.1-.5c-.3-.1-.7 0-.9.3-.9-.4-1.5-1.1-1.7-2 .3-.2.4-.6.3-.9l-.5-1.2c-.2-.5-.7-.7-1.2-.5-.5.2-.9.7-.9 1.5z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </>
  ),
  message: <path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3v4l4.5-4H20a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z" />,
  inbox: (
    <>
      <path d="M4 13l2.5-8h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 13h4l1 2h6l1-2h4" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 3 10.5l7 2.5 2.5 7z" />
      <path d="M21 3 10 13.5" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4l11 4.5V5.5z" />
      <path d="M15 8a4 4 0 0 1 0 8" />
      <path d="M7 15v2.5a2 2 0 0 0 4 0v-1" />
    </>
  ),
  headset: (
    <>
      <path d="M5 13v-1a7 7 0 0 1 14 0v1" />
      <rect x="3" y="12.5" width="4" height="6.5" rx="1.6" />
      <rect x="17" y="12.5" width="4" height="6.5" rx="1.6" />
      <path d="M19 19a4 4 0 0 1-4 3h-2.5" />
    </>
  ),

  // --- Time, tasks, alerts ---
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.8 5.5 2 6H4c.2-.5 2-1.5 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  hourglass: (
    <>
      <path d="M7 3h10M7 21h10" />
      <path d="M7.5 3c0 5 4.5 5 4.5 9s-4.5 4-4.5 9" />
      <path d="M16.5 3c0 5-4.5 5-4.5 9s4.5 4 4.5 9" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
    </>
  ),
  "calendar-check": (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
      <path d="M9 14.5l2 2 4-4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6.5A8 8 0 0 0 5.5 8" />
      <path d="M4 4v4h4" />
      <path d="M4 17.5A8 8 0 0 0 18.5 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),

  // --- Automation & flow ---
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  route: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H13a3.5 3.5 0 0 0 3.5-3.5v-6" />
    </>
  ),
  workflow: (
    <>
      <rect x="3" y="4" width="6" height="4.5" rx="1.2" />
      <rect x="15" y="15.5" width="6" height="4.5" rx="1.2" />
      <rect x="15" y="4" width="6" height="4.5" rx="1.2" />
      <path d="M9 6.2h3.5a1.5 1.5 0 0 1 1.5 1.5M14 17.7h-1a4 4 0 0 1-4-4V9" />
    </>
  ),
  filter: <path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  "list-checks": (
    <>
      <path d="M9.5 6h10.5M9.5 12h10.5M9.5 18h10.5" />
      <path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="4.5" width="12" height="15.5" rx="2" />
      <rect x="9" y="2.8" width="6" height="3.6" rx="1.2" />
      <path d="M9.5 11h5M9.5 15h3.5" />
    </>
  ),
  template: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5z" />
      <path d="M3.5 12 12 16.7 20.5 12M3.5 16 12 20.7 20.5 16" />
    </>
  ),
  sliders: (
    <>
      <path d="M5 8h14M5 16h14" />
      <circle cx="9" cy="8" r="2.3" />
      <circle cx="15" cy="16" r="2.3" />
    </>
  ),

  // --- Data & growth ---
  "chart-bar": (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 17v-5M12 17V9M16 17v-8" />
    </>
  ),
  "chart-line": (
    <>
      <path d="M4 4v16h16" />
      <path d="M6.5 15l3.5-3.5 3 2 5-6" />
    </>
  ),
  "trending-up": (
    <>
      <path d="M3 16.5l6-6 4 4 8-8" />
      <path d="M15 6.5h6v6" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <path d="M12 16l4.5-4.5" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  pie: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12V3.5M12 12l7.5 4" />
    </>
  ),
  percent: (
    <>
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
      <path d="M18 6 6 18" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9" />
      <path d="M14.5 9.5a3 2 0 0 0-3-1.5c-1.4 0-2.5.8-2.5 1.9s1 1.6 2.5 1.9 2.5.8 2.5 1.9-1.1 1.9-2.5 1.9a3 2 0 0 1-3-1.5" />
    </>
  ),
  star: <path d="M12 3.5l2.5 5.9 6.4.5-4.9 4.1 1.5 6.3L12 17.4 6 20.8l1.5-6.3-4.9-4.1 6.4-.5z" />,
  tag: (
    <>
      <path d="M4 4.5h7.5L20 13l-7.5 7.5L4 12z" />
      <circle cx="8" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),

  // --- People & trust ---
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.4a3 3 0 0 1 0 5.4M16.5 19a5.5 5.5 0 0 0-2.3-4.5" />
    </>
  ),
  "user-check": (
    <>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 19a6 6 0 0 1 12 0" />
      <path d="M16 12.5l1.8 1.8 3.7-3.7" />
    </>
  ),
  "user-plus": (
    <>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 19a6 6 0 0 1 12 0" />
      <path d="M18.5 8.5v5M16 11h5" />
    </>
  ),
  bot: (
    <>
      <rect x="5" y="8" width="14" height="10.5" rx="2.5" />
      <path d="M12 4v4M12 4a1.2 1.2 0 1 0 0-.01" />
      <path d="M2.5 12.5v3M21.5 12.5v3" />
      <circle cx="9.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z" />
      <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  shield: <path d="M12 3 5 6v5.5c0 4.8 3.4 7.8 7 9.5 3.6-1.7 7-4.7 7-9.5V6z" />,
  "shield-check": (
    <>
      <path d="M12 3 5 6v5.5c0 4.8 3.4 7.8 7 9.5 3.6-1.7 7-4.7 7-9.5V6z" />
      <path d="M9 11.5l2 2 4-4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10.5" rx="2.2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  handshake: (
    <>
      <path d="M11 7 8.5 4.5 3 8.5v5l2 1.5" />
      <path d="M13 7l2.5-2.5L21 8.5v5l-4 3-3-2.5" />
      <path d="M11 7 8 10a1.6 1.6 0 0 0 2.2 2.3L12 11l2 2 1.5 1.5" />
    </>
  ),

  // --- Discovery ---
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3 21 21" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17" />
    </>
  ),
  languages: (
    <>
      <path d="M3 5.5h8M7 5.5V4M4.5 5.5c.4 4 3 6.5 6 7.5M9.5 8.5c-.8 2.5-3.5 4.5-6 4.5" />
      <path d="M12.5 20l3.8-8.5L20 20M14 16.5h5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2 2 0 0 1 6 3.5h5.5v15H6a2 2 0 0 0-2 2z" />
      <path d="M20 5.5a2 2 0 0 0-2-2h-5.5v15H18a2 2 0 0 1 2 2z" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.5v7l6-3.5z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21c5-5.5 7-8.5 7-11a7 7 0 0 0-14 0c0 2.5 2 5.5 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),

  // --- Industry glyphs ---
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.2" />
      <path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15M10 21v-3h4v3" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3v4.5a4 4 0 0 0 8 0V3" />
      <path d="M6 3H4.2M14 3h1.8M10 15.5a6 6 0 0 0 6-6" />
      <circle cx="18" cy="11.5" r="2.5" />
    </>
  ),
  tooth: (
    <path d="M7 3.5c-2 0-3.2 1.8-3.2 3.8 0 2.6 1 3.6 1.5 6.5.4 2.2.6 6.7 1.9 6.7 1.1 0 1.1-3.2 1.5-5.2.2-1 1.4-1 1.6 0 .4 2 .4 5.2 1.5 5.2 1.3 0 1.5-4.5 1.9-6.7.5-2.9 1.5-3.9 1.5-6.5 0-2-1.2-3.8-3.2-3.8-1.5 0-2 1-3 1s-1.5-1-3-1z" />
  ),
  paw: (
    <>
      <ellipse cx="12" cy="15.5" rx="4" ry="3.2" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="10" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.3" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7.3" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="10" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6.5" r="2.3" />
      <circle cx="6" cy="17.5" r="2.3" />
      <path d="M8 7.8 20 17M8 16.2 20 7M8 7.8 12.5 12M8 16.2 12.5 12" />
    </>
  ),
  car: (
    <>
      <path d="M4 15l1.4-4.8A2.2 2.2 0 0 1 7.5 8.6h9a2.2 2.2 0 0 1 2.1 1.6L20 15" />
      <path d="M3.5 15h17v3.2h-2M5.5 18.2h-2V15" />
      <path d="M6 18.2h12" />
      <circle cx="7.5" cy="18.2" r="1.7" />
      <circle cx="16.5" cy="18.2" r="1.7" />
    </>
  ),
  cloud: <path d="M7.5 18.5a4.2 4.2 0 0 1-.3-8.4 5.3 5.3 0 0 1 10.1-1.2 3.8 3.8 0 0 1-.3 7.6z" />,
  "graduation-cap": (
    <>
      <path d="M3 8.5l9-4 9 4-9 4z" />
      <path d="M7 10.5V15c0 1 2.3 2.5 5 2.5s5-1.5 5-2.5v-4.5" />
      <path d="M21 8.5v5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5.2A2 2 0 0 1 11 3.2h2a2 2 0 0 1 2 2V7M3 12.5h18" />
    </>
  ),
  gem: (
    <>
      <path d="M6 4h12l3 5-9 11L3 9z" />
      <path d="M3 9h18M8 4l-2 5 6 11 6-11-2-5" />
    </>
  ),
  wrench: <path d="M15.5 3.5a5 5 0 0 0-4.3 7.4L4 18l2.5 2.5 7.1-7.2a5 5 0 0 0 6.9-5.8l-3 3-2.5-2.5z" />,
  umbrella: (
    <>
      <path d="M12 3.5a9 9 0 0 0-9 9h18a9 9 0 0 0-9-9z" />
      <path d="M12 3.5V2.5M12 12.5v5.5a2.5 2.5 0 0 1-5 0" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M7 8v8M4.5 9.5v5M17 8v8M19.5 9.5v5M7 12h10" />
    </>
  ),
  utensils: (
    <>
      <path d="M7 3v6.5a1.5 1.5 0 0 0 3 0V3M8.5 9.5V21" />
      <path d="M16 3c-1.3 0-2.2 2-2.2 5 0 2 1 3 2.2 3.2V21" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v17M7.5 21h9M5 7h14M8 4.5 5 7l-2.2-.5" />
      <path d="M5 7 2.8 12a2.6 2.6 0 0 0 4.4 0zM19 7l-2.2 5a2.6 2.6 0 0 0 4.4 0z" />
      <path d="M9.5 4.5a2.5 2.5 0 0 1 5 0" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />,
};

export const ICON_NAMES = Object.keys(PATHS);

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  const paths = PATHS[name] ?? PATHS.sparkles;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
