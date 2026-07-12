import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/privacy", "/terms"] },
    sitemap: "https://namzilabs.co/sitemap.xml",
  };
}
