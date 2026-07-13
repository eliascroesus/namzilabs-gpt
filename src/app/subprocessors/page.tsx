import type { Metadata } from "next";

import { LegalPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Subprocessors",
  description: "Service providers Namzi Labs uses to operate Namzi Data.",
  alternates: { canonical: "/subprocessors" },
};

const subprocessors = [
  {
    name: "Vercel",
    purpose: "Application hosting, content delivery, serverless execution and operational logs.",
  },
  { name: "Neon", purpose: "Managed PostgreSQL database hosting, backups and recovery." },
  { name: "Inngest", purpose: "Durable background workflow orchestration and retry execution." },
  {
    name: "Sentry",
    purpose: "Application error monitoring and performance diagnostics with default PII disabled.",
  },
] as const;

export default function SubprocessorsPage() {
  return (
    <LegalPage eyebrow="Trust" title="Subprocessors" updated="July 12, 2026">
      <p>
        Namzi Labs uses the service providers below to operate Namzi Data. They process customer
        information only for the stated operational purposes and under our agreements with them. The
        exact processing location depends on the production region and account configuration
        selected before launch.
      </p>
      <div className="mt-8 overflow-hidden rounded-xl border border-[var(--line)]">
        {subprocessors.map((provider) => (
          <section
            key={provider.name}
            className="border-b border-[var(--line)] p-5 last:border-b-0"
          >
            <h2 className="m-0 text-base">{provider.name}</h2>
            <p className="mt-2">{provider.purpose}</p>
          </section>
        ))}
      </div>
      <h2>Updates</h2>
      <p>
        We will update this page before adding a subprocessor that handles customer content in
        production. Customers may contact privacy@namzilabs.co with questions about this list.
      </p>
    </LegalPage>
  );
}
