import type { Locale } from "./locale";

export interface PageSeoInput {
  locale: Locale;
  /** Path without locale prefix and without leading slash, e.g. "crm-con-ia" or "sectores/inmobiliarias". Empty string for home. */
  path: string;
  title: string;
  description: string;
  /** Set to override the auto-computed alternate path resolution (rare). */
  noIndex?: boolean;
}
