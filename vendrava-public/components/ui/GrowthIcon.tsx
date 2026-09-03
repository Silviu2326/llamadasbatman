import type { ReactNode } from "react";

/** Inline line-style icons for the Growth Marketing Hub modules. */
const PATHS: Record<string, ReactNode> = {
  campaigns: (
    <>
      <path d="M4 8.5 13 6v8L4 11.5z" />
      <path d="M4 8.5v3" />
      <path d="M6.2 11.5 7 15.5h1.6l-.7-4" />
      <path d="M15 8.2c1.2.8 1.2 3 0 3.6" />
    </>
  ),
  email: (
    <>
      <rect x="3" y="5" width="14" height="10" rx="1.6" />
      <path d="M3.6 6.2 10 10.8l6.4-4.6" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M16.5 9.8a6.3 6.3 0 0 1-9 5.7L4 16.6l1.2-3.4A6.3 6.3 0 1 1 16.5 9.8z" />
      <path d="M8 8.4c0 3 2 4.4 3.6 4.9.5.1 1-.2 1.2-.7.1-.4-.1-.7-.5-.9l-.9-.4c-.3-.1-.6 0-.8.2-.7-.3-1.2-.9-1.4-1.6.2-.2.3-.5.2-.8l-.4-.9c-.2-.4-.6-.6-1-.4-.3.2-.6.6-.6 1z" />
    </>
  ),
  content: (
    <>
      <rect x="4.5" y="3" width="11" height="14" rx="1.6" />
      <path d="M7.2 7h5.6M7.2 10h5.6M7.2 13h3.6" />
    </>
  ),
  seo: (
    <>
      <circle cx="9" cy="9" r="4.8" />
      <path d="M12.6 12.6 16.5 16.5" />
    </>
  ),
  social: (
    <>
      <circle cx="6" cy="10" r="2.1" />
      <circle cx="14" cy="5.2" r="2.1" />
      <circle cx="14" cy="14.8" r="2.1" />
      <path d="m7.8 9 4.4-2.6M7.8 11l4.4 2.6" />
    </>
  ),
  referrals: (
    <>
      <circle cx="8" cy="7" r="2.5" />
      <path d="M3.7 16a4.4 4.4 0 0 1 8.6 0" />
      <path d="M15 6.5v4M13 8.5h4" />
    </>
  ),
  winback: (
    <>
      <path d="M15.6 7A6 6 0 1 0 16.5 11" />
      <path d="M16.4 4v3.2h-3.2" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 4v12h12" />
      <path d="M7.3 13v-2.6M10.5 13V7.8M13.7 13V6" />
    </>
  ),
};

export function GrowthIcon({ name, className = "" }: { name: string; className?: string }) {
  const paths = PATHS[name] ?? PATHS.analytics;
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
