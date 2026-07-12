import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://namzilabs.co"),
  title: { default: "Namzi Data", template: "%s · Namzi Data" },
  description: "Reliable, unified operational data from the tools your business uses.",
  applicationName: "Namzi Data",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Namzi Data",
    title: "Namzi Data — Unified operational analytics",
    description:
      "Connect business systems, build traceable metrics and inspect every underlying record.",
    url: "https://namzilabs.co",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
