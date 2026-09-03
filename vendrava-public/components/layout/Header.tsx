import Link from "next/link";
import type { Locale } from "@/types/locale";
import type { CommonContent } from "@/types/content";
import { pathFor } from "@/lib/routes";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileNavigation } from "./MobileNavigation";

const SOLUTIONS_ROUTE_KEYS = [
  "product.sales-automation",
  "product.growth-marketing-crm",
  "product.sales-analytics",
  "product.sales-proposals",
];

const RESOURCES_ITEMS_BY_LOCALE = {
  es: [
    { routeKey: "resources.blog", label: "Blog" },
    { routeKey: "resources.guides", label: "Guías" },
    { routeKey: "resources.case-studies", label: "Casos de éxito" },
    { routeKey: "resources.glossary", label: "Glosario" },
  ],
  en: [
    { routeKey: "resources.blog", label: "Blog" },
    { routeKey: "resources.guides", label: "Guides" },
    { routeKey: "resources.case-studies", label: "Case studies" },
    { routeKey: "resources.glossary", label: "Glossary" },
  ],
} as const;

export function Header({ locale, common }: { locale: Locale; common: CommonContent }) {
  const productItems = common.nav.product.items.map((item) => ({
    label: item.label,
    href: pathFor(item.routeKey, locale),
  }));

  const solutionsItems = SOLUTIONS_ROUTE_KEYS.map((key) => {
    const item = common.nav.product.items.find((i) => i.routeKey === key);
    return item ? { label: item.label, href: pathFor(key, locale) } : null;
  }).filter((item): item is { label: string; href: string } => item !== null);

  const resourcesItems = RESOURCES_ITEMS_BY_LOCALE[locale].map((item) => ({
    label: item.label,
    href: pathFor(item.routeKey, locale),
  }));

  const navGroups = [
    { label: common.nav.product.title, items: productItems },
    { label: common.nav.solutions, items: solutionsItems },
    { label: common.nav.industries, href: pathFor("industries.index", locale) },
    { label: common.nav.resources, items: resourcesItems },
    { label: common.nav.pricing, href: pathFor("pricing", locale) },
    { label: common.nav.security, href: pathFor("security", locale) },
  ];

  return (
    <header className="sticky top-0 z-[60] border-b border-white/[0.08] bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-[70px] max-w-7xl items-center gap-7 px-6">
        <Link href={pathFor("home", locale)} className="flex flex-none items-center" aria-label="Vendrava">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Vendrava" width={800} height={189} className="h-8 w-auto" />
        </Link>

        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {navGroups.map((group) => (
            <div key={group.label} className="group relative">
              {"href" in group && group.href ? (
                <Link
                  href={group.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {group.label}
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors group-hover:bg-white/[0.06] group-hover:text-white"
                  >
                    {group.label}
                  </button>
                  {"items" in group && group.items && (
                    <div className="invisible absolute left-0 top-full z-50 w-64 pt-2 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100">
                      <div className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-navy/95 p-2 shadow-2xl backdrop-blur-xl">
                        {group.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="rounded-lg px-3 py-2 text-sm text-soft transition-colors hover:bg-white/[0.06] hover:text-white"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitcher locale={locale} labels={common.langSwitcher} />
          <Link
            href={`${pathFor("home", locale)}#como-funciona`}
            className="hidden rounded-lg border border-white/20 px-3.5 py-2 text-sm font-semibold text-soft transition-colors hover:border-white/40 hover:text-white lg:inline-flex"
          >
            {common.cta.secondary}
          </Link>
          <Link
            href={pathFor("demo", locale)}
            className="hidden rounded-lg bg-gradient-to-br from-electric to-cyan px-4 py-2 text-sm font-semibold text-bg shadow-[0_6px_22px_rgba(59,130,246,0.4)] transition-transform hover:-translate-y-0.5 lg:inline-flex"
          >
            {common.cta.primary}
          </Link>
          <MobileNavigation locale={locale} common={common} navGroups={navGroups} />
        </div>
      </div>
    </header>
  );
}
