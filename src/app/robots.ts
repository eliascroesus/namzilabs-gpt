import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/subprocessors"],
      disallow: [
        "/login",
        "/overview",
        "/dashboards",
        "/metrics",
        "/data",
        "/integrations",
        "/settings",
        "/api",
      ],
    },
    sitemap: "https://namzilabs.co/sitemap.xml",
  };
}
