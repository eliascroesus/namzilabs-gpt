"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ConnectorManifest } from "@/connectors/types";
import { Button } from "@/components/ui/button";

export function ConnectionWizard({ manifest }: { manifest: ConnectorManifest }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhook, setWebhook] = useState<{
    id: string;
    webhookUrl?: string;
    webhookSecret?: string;
  } | null>(null);
  const needsApiKey = manifest.authType === "api-key";

  async function createConnection() {
    setConnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: manifest.id,
          name: `${manifest.name} account`,
          ...(needsApiKey ? { apiKey } : {}),
          configuration:
            manifest.id === "webhook"
              ? {
                  eventIdPath: "id",
                  eventTypePath: "type",
                  eventTimePath: "createdAt",
                  authenticationMode: "catch-url",
                  requireTimestamp: false,
                  webhookToleranceSeconds: 300,
                }
              : manifest.id === "whop"
                ? { companyId: companyId.trim() }
                : {},
        }),
      });
      const result = (await response.json()) as {
        data?: { id?: string; webhookUrl?: string; webhookSecret?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data?.id) {
        throw new Error(result.error?.message ?? "The account could not be connected.");
      }
      if (manifest.authType === "oauth2") {
        window.location.assign(
          `/api/integrations/${manifest.id}/authorize?connectionId=${encodeURIComponent(result.data.id)}`,
        );
        return;
      }
      if (manifest.id === "webhook") {
        setWebhook({
          id: result.data.id,
          webhookUrl: result.data.webhookUrl,
          webhookSecret: result.data.webhookSecret,
        });
        return;
      }
      router.push(`/integrations/${result.data.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The account could not be connected.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/integrations" className="eyebrow-link">
        <ArrowLeft size={14} /> Back to integrations
      </Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_260px]">
        <section className="shell-card p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span className="provider-mark size-12">{manifest.logo}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Connect account
              </p>
              <h1 className="mt-1 text-2xl font-semibold">{manifest.name}</h1>
            </div>
          </div>

          <p className="mt-7 max-w-xl text-sm leading-6 text-[var(--muted)]">
            {manifest.id === "google-sheets"
              ? "Authorize your Google account once. You will choose the spreadsheet, tab, columns, and filters later while building each metric."
              : `Connect this ${manifest.name} account once. Data objects and filters are selected later in the metric builder.`}
          </p>

          {needsApiKey ? (
            <div className="mt-7 grid gap-4">
              <label className="block text-sm font-medium">
                API key
                <div className="relative mt-2">
                  <KeyRound
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                  />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Paste your scoped API key"
                    className="field-control w-full pl-10"
                    autoComplete="off"
                  />
                </div>
              </label>
              {manifest.id === "whop" ? (
                <label className="block text-sm font-medium">
                  Company ID
                  <input
                    value={companyId}
                    onChange={(event) => setCompanyId(event.target.value)}
                    placeholder="biz_xxxxxxxxxxxxxx"
                    className="field-control mt-2 w-full"
                    autoComplete="off"
                  />
                  <span className="mt-2 block text-xs font-normal text-[var(--muted)]">
                    Copy the <code>biz_…</code> ID from your Whop company dashboard.
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}

          {webhook ? (
            <div className="mt-7 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--success)]">
                <Check size={16} /> Webhook connected
              </div>
              <p className="mt-4 text-xs text-[var(--muted)]">Endpoint</p>
              <code className="mt-1 block break-all text-xs">{webhook.webhookUrl}</code>
              <p className="mt-4 text-xs text-[var(--muted)]">
                Optional signing secret — only needed when the sender supports custom Namzi headers
              </p>
              <code className="mt-1 block break-all text-xs">{webhook.webhookSecret}</code>
              <Button className="mt-5" onClick={() => router.push(`/integrations/${webhook.id}`)}>
                Open connection <ArrowRight size={16} />
              </Button>
            </div>
          ) : (
            <Button
              className="mt-7"
              onClick={createConnection}
              disabled={
                connecting ||
                (needsApiKey && apiKey.length < 8) ||
                (manifest.id === "whop" && !companyId.trim().startsWith("biz_"))
              }
            >
              {manifest.authType === "oauth2" ? <ExternalLink size={16} /> : <Check size={16} />}
              {connecting
                ? "Connecting…"
                : manifest.authType === "oauth2"
                  ? `Sign in to ${manifest.name}`
                  : `Connect ${manifest.name}`}
            </Button>
          )}

          {error ? (
            <div role="alert" className="error-panel mt-5">
              {error}
            </div>
          ) : null}
        </section>

        <aside className="space-y-3">
          {[
            [LockKeyhole, "Read-only", "Namzi requests read access and never edits source data."],
            [Copy, "One account", "Reuse this account across every metric and dashboard."],
            [Check, "Test before save", "Preview real recent records before publishing a metric."],
          ].map(([Icon, title, detail]) => {
            const ItemIcon = Icon as typeof Check;
            return (
              <div key={String(title)} className="rounded-xl border border-[var(--line)] p-4">
                <ItemIcon size={16} className="text-[var(--accent)]" />
                <p className="mt-3 text-sm font-semibold">{String(title)}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{String(detail)}</p>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
