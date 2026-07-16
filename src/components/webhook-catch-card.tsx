"use client";

import { Check, Clipboard, Radio, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function WebhookCatchCard({ url }: { url: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setMessage("Catch hook URL copied.");
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    try {
      const now = new Date();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `namzi_test_${now.getTime()}`,
          type: "namzi.test",
          createdAt: now.toISOString(),
          payload: { message: "Namzi catch hook is working" },
        }),
      });
      const result = (await response.json()) as {
        accepted?: number;
        processed?: number;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "The test delivery failed.");
      setMessage(
        `${result.accepted ?? 0} test record accepted${result.processed ? " and processed" : ""}.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The test delivery failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="shell-card mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-tile">
            <Radio size={17} />
          </span>
          <div>
            <h2 className="font-semibold">Catch hook URL</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Paste this exact URL into the sending app. The full path is required—using only
              namzilabs.co will not reach this connection.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void copyUrl()}>
            <Clipboard size={15} /> Copy URL
          </Button>
          <Button onClick={() => void sendTest()} disabled={testing}>
            <Send size={15} /> {testing ? "Testing…" : "Send test record"}
          </Button>
        </div>
      </div>
      <code className="mt-4 block overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs">
        {url}
      </code>
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
        <Check size={14} className="text-[var(--success)]" /> Accepts JSON, form-encoded, XML and
        text payloads over POST or PUT. Recent requests become test records automatically.
      </div>
      {message ? (
        <p role="status" className="mt-3 text-xs text-[var(--muted)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
