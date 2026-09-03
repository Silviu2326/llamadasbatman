import type { MetadataRoute } from "next";
import { ROUTES } from "@/lib/routes";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ROUTES.flatMap((route) => {
    const esUrl = `${SITE_URL}/es/${route.es ? `${route.es}/` : ""}`;
    const enUrl = `${SITE_URL}/en/${route.en ? `${route.en}/` : ""}`;

    const alternates = {
      languages: {
        es: esUrl,
        en: enUrl,
        "x-default": enUrl,
      },
    };

    return [
      { url: esUrl, lastModified, changeFrequency: "weekly" as const, priority: route.key === "home" ? 1 : 0.7, alternates },
      { url: enUrl, lastModified, changeFrequency: "weekly" as const, priority: route.key === "home" ? 1 : 0.7, alternates },
    ];
  });
}
