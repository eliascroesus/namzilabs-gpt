import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access to and use of the Namzi Data service.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" updated="July 11, 2026">
      <p>
        These Terms of Service (“Terms”) govern access to and use of Namzi Data, websites and
        related services provided by Namzi Labs (“Namzi,” “we,” “us,” or “our”). By using the
        service, you agree to these Terms on behalf of yourself and, if applicable, your
        organization.
      </p>

      <h2>1. Eligibility and accounts</h2>
      <p>
        You must be at least 18 and able to form a binding contract. You must provide accurate
        account information, protect your credentials and promptly notify us of suspected
        unauthorized access. Organization administrators are responsible for member access and
        connected systems.
      </p>

      <h2>2. The service</h2>
      <p>
        Namzi Data connects customer-authorized systems, stores source records, and presents
        deterministic metrics and dashboards configured by customers. Features may change as we
        improve the service. Beta or preview features may be less reliable and may be changed or
        discontinued.
      </p>

      <h2>3. Customer data and permissions</h2>
      <p>
        You retain ownership of data you submit or connect. You grant us a limited right to host,
        process, transmit and display that data only as needed to provide, secure and support the
        service. You represent that you have the rights and permissions needed to connect each
        system and process its data.
      </p>
      <p>
        You are responsible for the metrics, filters, goals and business decisions you configure.
        Namzi Data is an analytical tool and does not provide legal, financial, employment or
        professional advice.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        You may not use the service to violate law or third-party rights; access systems without
        authorization; distribute malware; interfere with service operation; circumvent usage or
        security controls; reverse engineer except where law expressly permits; resell the service
        without authorization; or submit data whose processing is prohibited by your agreement with
        us.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        The service interoperates with providers such as Google, Calendly and CRM or messaging
        platforms. Your use of those services remains governed by their terms. We are not
        responsible for changes, outages or actions of third-party services, but we design
        reconciliation and health monitoring to make integration status visible.
      </p>

      <h2>6. Fees</h2>
      <p>
        Paid plans, limits, billing periods and taxes will be described at purchase or in an order
        form. Unless required by law or stated otherwise, fees are non-refundable. We may suspend
        paid features for overdue amounts after reasonable notice.
      </p>

      <h2>7. Confidentiality and security</h2>
      <p>
        Each party will protect the other party’s non-public confidential information using
        reasonable care and use it only to perform under these Terms. We maintain reasonable
        technical and organizational safeguards, but no service can guarantee absolute security.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        Namzi and its licensors retain all rights in the service, software, documentation, branding
        and improvements. If you provide feedback, you permit us to use it without restriction or
        payment, without identifying you publicly.
      </p>

      <h2>9. Suspension and termination</h2>
      <p>
        You may stop using the service and disconnect providers at any time. We may suspend or
        terminate access for material breach, security risk, unlawful conduct, non-payment or where
        necessary to protect the service. Provisions that by their nature should survive termination
        will survive.
      </p>

      <h2>10. Disclaimers and liability</h2>
      <p>
        To the maximum extent permitted by law, the service is provided “as is” and “as available.”
        We disclaim implied warranties of merchantability, fitness for a particular purpose and
        non-infringement. We do not warrant that every third-party record will always be available
        or error-free.
      </p>
      <p>
        To the maximum extent permitted by law, neither party will be liable for indirect,
        incidental, special, consequential or punitive damages, or loss of profits, revenues,
        goodwill or data. Our aggregate liability arising from the service will not exceed the
        amount you paid us for the service during the 12 months before the event giving rise to the
        claim. These limits do not apply where prohibited by law.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms. Material changes will apply prospectively, and we will provide
        notice when required. Continued use after an effective update constitutes acceptance.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms may be sent to{" "}
        <a href="mailto:legal@namzilabs.co">legal@namzilabs.co</a>. Support requests may be sent to{" "}
        <a href="mailto:support@namzilabs.co">support@namzilabs.co</a>.
      </p>
      <p>
        Our handling of personal information is described in the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
