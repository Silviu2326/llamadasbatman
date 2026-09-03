import Link from "next/link";
import type { Locale } from "@/types/locale";
import type { CommonContent } from "@/types/content";
import { pathFor } from "@/lib/routes";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Footer({ locale, common }: { locale: Locale; common: CommonContent }) {
  const year = new Date().getFullYear();
  const columns = [
    common.footer.columns.product,
    common.footer.columns.industries,
    common.footer.columns.resources,
    common.footer.columns.company,
    common.footer.columns.legal,
  ];

  return (
    <footer className="border-t border-white/10 bg-navy/40">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href={pathFor("home", locale)} className="flex items-center" aria-label="Vendrava">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Vendrava" width={800} height={189} className="h-9 w-auto" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{common.footer.tagline}</p>
            <p className="mt-3 font-mono text-xs text-faint">{common.footer.built}</p>
            <div className="mt-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">
                {common.footer.languageLabel}
              </div>
              <LanguageSwitcher locale={locale} labels={common.langSwitcher} />
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-faint">{col.title}</div>
              <ul className="flex flex-col gap-2.5">
                {col.items.map((item) => (
                  <li key={item.routeKey}>
                    <Link
                      href={pathFor(item.routeKey, locale)}
                      className="text-sm text-muted transition-colors hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-faint md:flex-row md:items-center md:justify-between">
          <span>
            © {year} Vendrava. {common.footer.rights}
          </span>
          <span>
            {locale === "es" ? "Un proyecto de" : "A project by"}{" "}
            <a
              href="https://sprintmarkt.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-muted transition-colors hover:text-white"
            >
              SprintMarkt
            </a>{" "}
            · Valencia
          </span>
        </div>
      </div>
    </footer>
  );
}
