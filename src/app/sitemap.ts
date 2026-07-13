import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-07-11T00:00:00Z");
  return [
    { url: "https://namzilabs.co", lastModified, changeFrequency: "weekly", priority: 1 },
    {
      url: "https://namzilabs.co/privacy",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    { url: "https://namzilabs.co/terms", lastModified, changeFrequency: "monthly", priority: 0.5 },
    {
      url: "https://namzilabs.co/subprocessors",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
