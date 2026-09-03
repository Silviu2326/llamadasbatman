"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/types/locale";
import type { CommonContent } from "@/types/content";
import { pathFor } from "@/lib/routes";

interface NavGroup {
  label: string;
  href?: string;
  items?: { label: string; href: string }[];
}

export function MobileNavigation({
  locale,
  common,
  navGroups,
}: {
  locale: Locale;
  common: CommonContent;
  navGroups: NavGroup[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1 rounded-lg border border-white/20"
      >
        <span className="h-0.5 w-4 rounded bg-soft" />
        <span className="h-0.5 w-4 rounded bg-soft" />
        <span className="h-0.5 w-4 rounded bg-soft" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[70px] z-50 max-h-[calc(100vh-70px)] overflow-y-auto border-t border-white/10 bg-bg px-5 pb-6 pt-3 shadow-2xl">
          <nav className="flex flex-col gap-1">
            {navGroups.map((group) =>
              group.href ? (
                <Link
                  key={group.label}
                  href={group.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border-b border-white/[0.06] px-2 py-3 text-[15px] font-medium text-soft"
                >
                  {group.label}
                </Link>
              ) : (
                <div key={group.label} className="border-b border-white/[0.06] py-2">
                  <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-faint">
                    {group.label}
                  </div>
                  {group.items?.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-2 py-2 text-[15px] text-soft"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )
            )}
          </nav>
          <Link
            href={pathFor("demo", locale)}
            onClick={() => setOpen(false)}
            className="mt-4 block rounded-xl bg-gradient-to-br from-electric to-cyan px-4 py-3.5 text-center text-[15px] font-semibold text-bg"
          >
            {common.cta.primary}
          </Link>
        </div>
      )}
    </div>
  );
}
