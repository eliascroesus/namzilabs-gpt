"use client";

import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ConnectorManifest } from "@/connectors/types";
import { Button } from "@/components/ui/button";

const steps = ["Connect", "Choose data", "Preview", "Identify fields", "Sync", "Review"];

export function ConnectionWizard({ manifest }: { manifest: ConnectorManifest }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [uniqueKey, setUniqueKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [activation, setActivation] = useState<{
    id: string;
    webhookUrl?: string;
    webhookSecret?: string;
  } | null>(null);
  const needsApiKey = manifest.authType === "api-key";
  const progress = useMemo(() => `${Math.round(((step + 1) / steps.length) * 100)}%`, [step]);

  async function startOAuth() {
    setConnecting(true);
    setConnectionError(null);
    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: manifest.id,
          name: `${manifest.name} connection`,
          configuration: {},
        }),
      });
      const result = (await response.json()) as {
        data?: { id?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data?.id) {
        throw new Error(result.error?.message ?? "The connection could not be created.");
      }
      window.location.assign(
        `/api/integrations/${manifest.id}/authorize?connectionId=${encodeURIComponent(result.data.id)}`,
      );
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "The connection could not start.",
      );
      setConnecting(false);
    }
  }

  async function activateConnection() {
    setConnecting(true);
    setConnectionError(null);
    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: manifest.id,
          name: `${manifest.name} connection`,
          ...(needsApiKey ? { apiKey } : {}),
          configuration:
            manifest.id === "webhook"
              ? {
                  eventIdPath: "id",
                  eventTypePath: "type",
                  eventTimePath: "createdAt",
                  requireTimestamp: true,
                  webhookToleranceSeconds: 300,
                }
              : {},
        }),
      });
      const result = (await response.json()) as {
        data?: { id?: string; webhookUrl?: string; webhookSecret?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data?.id) {
        throw new Error(result.error?.message ?? "The connection could not be activated.");
      }
      if (manifest.id === "webhook") {
        setActivation({
          id: result.data.id,
          webhookUrl: result.data.webhookUrl,
          webhookSecret: result.data.webhookSecret,
        });
      } else {
        router.push(`/integrations/${result.data.id}`);
        router.refresh();
      }
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "The connection could not be activated.",
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3 text-sm text-[var(--muted)]">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--brand-soft)] font-bold text-[var(--brand-dark)]">
          {manifest.logo}
        </span>
        <span>{manifest.name}</span>
        <span>/</span>
        <span>{steps[step]}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-all"
          style={{ width: progress }}
        />
      </div>

      <section className="shell-card mt-6 min-h-[430px] p-6 sm:p-8">
        {step === 0 ? (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Step 1 of {steps.length}</p>
            <h1 className="mt-2 text-2xl font-bold">Connect {manifest.name}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
              We request only the access needed to read the data listed below. Credentials are
              encrypted before storage and are never shown again.
            </p>
            {needsApiKey ? (
              <label className="mt-7 block max-w-lg text-sm font-semibold">
                API key
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Paste the scoped API key"
                  className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal outline-none focus:border-[var(--brand)]"
                />
                <span className="mt-2 block text-xs font-normal text-[var(--muted)]">
                  The key is sent directly to the server over HTTPS and will be returned only as a
                  masked value.
                </span>
              </label>
            ) : manifest.authType === "oauth2" ? (
              <Button className="mt-7" onClick={startOAuth} disabled={connecting}>
                <ExternalLink size={16} />{" "}
                {connecting ? "Opening secure consent…" : `Continue to ${manifest.name}`}
              </Button>
            ) : (
              <div className="mt-7 rounded-xl border border-[var(--line)] bg-slate-50 p-4 text-sm">
                <div className="font-semibold">
                  A secure endpoint will be generated after activation.
                </div>
                <div className="mt-1 text-[var(--muted)]">
                  You can authenticate with a secret header or HMAC-SHA256 signature.
                </div>
              </div>
            )}
            <div className="mt-7 flex items-center gap-2 text-xs text-[var(--muted)]">
              <ShieldCheck size={15} /> Read-only connection. No Zapier-style actions are performed.
            </div>
            {connectionError ? (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {connectionError}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Step 2 of {steps.length}</p>
            <h1 className="mt-2 text-2xl font-bold">What should we track?</h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Only capabilities published by this connector are available.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {manifest.resources.map((resource, index) => (
                <label
                  key={resource}
                  className="flex cursor-pointer gap-3 rounded-xl border border-[var(--line)] p-4"
                >
                  <input
                    type="checkbox"
                    defaultChecked={index === 0}
                    className="mt-1 accent-[var(--brand)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold capitalize">
                      {resource.replaceAll("_", " ")}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      Available through {manifest.apiVersion}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Step 3 of {steps.length}</p>
            <h1 className="mt-2 text-2xl font-bold">Preview the latest records</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
              This screen will show up to three genuine records after the account is connected.
              Production never substitutes invented sample data.
            </p>
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <div className="text-sm font-semibold">Connect the account to fetch a preview</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Raw values remain unchanged in the event store.
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Step 4 of {steps.length}</p>
            <h1 className="mt-2 text-2xl font-bold">How should records be identified?</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Choose a stable identifier so updates do not create duplicates.
            </p>
            {manifest.id === "google-sheets" ? (
              <label className="mt-6 block max-w-md text-sm font-semibold">
                Unique key column
                <input
                  value={uniqueKey}
                  onChange={(event) => setUniqueKey(event.target.value)}
                  placeholder="For example: Lead ID"
                  className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal"
                />
                <span className="mt-2 block text-xs font-normal text-[var(--warning)]">
                  Row numbers are not stable when rows are reordered or deleted.
                </span>
              </label>
            ) : (
              <div className="mt-6 rounded-xl bg-[var(--brand-soft)] p-4 text-sm">
                <Check size={16} className="mb-2 text-[var(--brand)]" />
                {manifest.name} supplies stable record identifiers for supported resources.
              </div>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Step 5 of {steps.length}</p>
            <h1 className="mt-2 text-2xl font-bold">Choose freshness</h1>
            <div className="mt-6 space-y-3">
              <label className="flex gap-3 rounded-xl border-2 border-[var(--brand)] bg-[var(--brand-soft)] p-4">
                <input
                  type="radio"
                  name="sync"
                  defaultChecked
                  className="mt-1 accent-[var(--brand)]"
                />
                <span>
                  <span className="block text-sm font-semibold">Best available</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    Webhooks first, with scheduled API reconciliation.
                  </span>
                </span>
              </label>
              <label className="flex gap-3 rounded-xl border border-[var(--line)] p-4">
                <input type="radio" name="sync" className="mt-1 accent-[var(--brand)]" />
                <span>
                  <span className="block text-sm font-semibold">Scheduled only</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    Useful when the provider plan does not include webhooks.
                  </span>
                </span>
              </label>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">Step 6 of {steps.length}</p>
            <h1 className="mt-2 text-2xl font-bold">Review and activate</h1>
            <div className="mt-6 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
              {[
                ["Provider", manifest.name],
                ["API version", manifest.apiVersion],
                ["Mapping version", String(manifest.mappingVersion)],
                [
                  "Freshness",
                  manifest.capabilities.includes("webhooks")
                    ? "Webhooks + reconciliation"
                    : "Scheduled",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <span className="text-[var(--muted)]">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
            {activation ? (
              <div className="mt-5 rounded-xl bg-slate-950 p-4 text-xs text-slate-200">
                <p className="font-semibold text-white">Copy this secret now. It is shown once.</p>
                <p className="mt-3 break-all font-mono">{activation.webhookUrl}</p>
                <p className="mt-2 break-all font-mono">{activation.webhookSecret}</p>
                <p className="mt-3 text-slate-400">
                  Send x-namzi-timestamp with each request. HMAC signatures bind the timestamp and
                  raw body and expire after five minutes.
                </p>
              </div>
            ) : manifest.id === "webhook" ? (
              <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-950 p-4 text-xs text-slate-200">
                <code>Endpoint and one-time secret are generated after activation</code>
                <Copy size={15} />
              </div>
            ) : null}
            {activation ? (
              <Button
                className="mt-6"
                onClick={() => router.push(`/integrations/${activation.id}`)}
              >
                Open connection <ChevronRight size={16} />
              </Button>
            ) : (
              <Button className="mt-6" onClick={activateConnection} disabled={connecting}>
                {connecting ? "Activating…" : "Activate connection"}
              </Button>
            )}
          </div>
        ) : null}
      </section>

      <div className="mt-5 flex justify-between">
        <Button
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
        >
          <ChevronLeft size={16} /> Back
        </Button>
        {step < steps.length - 1 ? (
          <Button
            disabled={
              (needsApiKey && step === 0 && apiKey.length < 8) ||
              (manifest.authType === "oauth2" && step === 0)
            }
            onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
          >
            Continue <ChevronRight size={16} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
