"use client";

import { usePathname, useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/types/locale";
import { equivalentPath } from "@/lib/routes";
import { LOCALE_COOKIE_NAME } from "@/lib/constants";

export function LanguageSwitcher({
  locale,
  labels,
  className = "",
}: {
  locale: Locale;
  labels: { es: string; en: string };
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(target: Locale) {
    if (target === locale) return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${target}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    router.push(equivalentPath(pathname, locale, target));
  }

  return (
    <div className={`flex overflow-hidden rounded-lg border border-white/20 font-mono text-xs font-semibold ${className}`}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          aria-current={locale === code ? "true" : undefined}
          className={`px-2.5 py-1.5 transition-colors ${
            locale === code ? "bg-gradient-to-br from-electric to-cyan text-bg" : "text-muted hover:text-white"
          }`}
        >
          {labels[code]}
        </button>
      ))}
    </div>
  );
}
