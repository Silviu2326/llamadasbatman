import { DEFAULT_LOCALE, isLocale, type Locale } from "@/types/locale";

export { LOCALES, DEFAULT_LOCALE, isLocale } from "@/types/locale";
export type { Locale } from "@/types/locale";

const SPANISH_SPEAKING_COUNTRIES = new Set([
  "ES",
  "MX",
  "AR",
  "CO",
  "PE",
  "CL",
  "VE",
  "EC",
  "GT",
  "CU",
  "BO",
  "DO",
  "HN",
  "PY",
  "SV",
  "NI",
  "CR",
  "PA",
  "UY",
  "GQ",
]);

export function isSpanishSpeakingCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return SPANISH_SPEAKING_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Parses an Accept-Language header and returns the first supported locale,
 * falling back to null when nothing matches.
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const languages = header
    .split(",")
    .map((part) => part.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean) as string[];

  for (const lang of languages) {
    const base = lang.split("-")[0];
    if (base && isLocale(base)) return base;
  }
  return null;
}

export function resolveLocale({
  cookieLocale,
  countryCode,
  acceptLanguage,
}: {
  cookieLocale?: string | null;
  countryCode?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale;
  if (isSpanishSpeakingCountry(countryCode)) return "es";
  const fromHeader = localeFromAcceptLanguage(acceptLanguage ?? null);
  if (fromHeader) return fromHeader;
  return DEFAULT_LOCALE;
}
