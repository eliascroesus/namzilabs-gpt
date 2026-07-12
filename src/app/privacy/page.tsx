import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Namzi Labs collects, uses, protects and deletes data in Namzi Data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" updated="July 11, 2026">
      <p>
        This Privacy Policy explains how Namzi Labs (“Namzi,” “we,” “us,” or “our”) handles
        information when you visit namzilabs.co or use the Namzi Data platform.
      </p>

      <h2>1. Information we collect</h2>
      <p>
        We may collect account information such as your name, business email address, organization,
        role and authentication identifiers; connection information such as provider account
        identifiers, OAuth grants and encrypted access or refresh tokens; and the business records
        you choose to connect, including spreadsheet rows, meetings, contacts, campaigns, messages,
        calls and CRM activities.
      </p>
      <p>
        We also collect limited technical data needed to operate and secure the service, including
        timestamps, IP-derived security signals, browser type, audit events, synchronization status
        and error diagnostics. We do not ask for or store your Google password.
      </p>

      <h2>2. Google user data</h2>
      <p>
        When you connect Google Drive or Google Sheets, Namzi Data requests only the permissions
        shown on Google’s consent screen. We use authorized Google data to discover the spreadsheets
        you select, read their structure and values, detect changes, synchronize selected records
        and display analytics you configure.
      </p>
      <p>
        We do not sell Google user data, use it for advertising, or allow humans to read it except
        when necessary for security, support requested by you, legal compliance, or service
        operations permitted by law. Our use and transfer of information received from Google APIs
        follows the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including its Limited Use requirements.
      </p>

      <h2>3. How we use information</h2>
      <p>
        We use information to provide and secure the service; authenticate users and enforce
        organization permissions; ingest, normalize and reconcile connected records; calculate
        customer-defined deterministic metrics; provide support; monitor reliability; prevent abuse;
        comply with law; and improve product usability and performance.
      </p>

      <h2>4. How we share information</h2>
      <p>
        We do not sell personal information. We may share information with service providers that
        help us host, secure and operate Namzi Data, such as database, cloud hosting,
        authentication, workflow and error-monitoring providers. These providers may process data
        only for the services they provide to us. We may also disclose information when legally
        required or during a corporate transaction subject to appropriate protections.
      </p>

      <h2>5. Storage, security and retention</h2>
      <p>
        Connection credentials are encrypted at rest and access is limited by tenant and role. We
        use transport encryption, audit logging, least-privilege access and operational monitoring.
        No system is perfectly secure, so we cannot guarantee absolute security.
      </p>
      <p>
        We retain customer data while an account or connection is active and as needed for backups,
        audit obligations, dispute resolution and legal compliance. When a connection or account is
        deleted, we delete or de-identify associated data according to our retention procedures
        unless continued retention is required by law.
      </p>

      <h2>6. Your choices and rights</h2>
      <p>
        You may disconnect a provider from Namzi Data and revoke Google access at any time through
        your{" "}
        <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
          Google Account connections
        </a>
        . Depending on your location, you may request access, correction, deletion, restriction,
        portability or objection by contacting us. Organization administrators may also manage
        connected data and members.
      </p>

      <h2>7. International processing</h2>
      <p>
        Information may be processed in countries other than where you live. Where required, we use
        appropriate safeguards for international transfers.
      </p>

      <h2>8. Children</h2>
      <p>
        Namzi Data is a business service and is not directed to children under 16. We do not
        knowingly collect personal information from children.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this policy as the service or law changes. We will post the revised date here
        and provide additional notice when required.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy requests or questions, email{" "}
        <a href="mailto:privacy@namzilabs.co">privacy@namzilabs.co</a>. For general support, email{" "}
        <a href="mailto:support@namzilabs.co">support@namzilabs.co</a>.
      </p>
      <p>
        See our <Link href="/terms">Terms of Service</Link> for the rules governing use of Namzi
        Data.
      </p>
    </LegalPage>
  );
}
