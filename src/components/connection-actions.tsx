"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ConnectionActions({
  connectionId,
  provider,
  status,
}: {
  connectionId: string;
  provider: string;
  status: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function reconcile() {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/connections/${connectionId}/reconcile`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        data?: { status?: string; recordsWritten?: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Reconciliation could not start.");
      setMessage(
        result.data?.status === "current"
          ? `${result.data.recordsWritten?.toLocaleString() ?? 0} records synchronized.`
          : "Synchronization queued. Freshness will update when the durable run completes.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reconciliation could not start.");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Permanently delete this integration and its stored source data?")) return;
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/connections/${connectionId}?deleteData=true`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message ?? "The connection could not be deleted.");
      }
      router.push("/integrations");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The connection could not be deleted.");
      setWorking(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        {["google-sheets", "google-calendar", "calendly", "cal-com", "close"].includes(provider) &&
        ["paused", "revoked", "error"].includes(status) ? (
          <Link
            href={`/api/integrations/${provider}/authorize?connectionId=${encodeURIComponent(connectionId)}`}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white"
          >
            Reconnect
          </Link>
        ) : null}
        {provider !== "webhook" ? (
          <Button variant="secondary" onClick={reconcile} disabled={working}>
            <RefreshCw size={15} /> Force sync
          </Button>
        ) : null}
        <Button variant="secondary" onClick={disconnect} disabled={working}>
          <Trash2 size={15} /> Delete integration
        </Button>
      </div>
      {message ? (
        <p role="status" className="mt-2 max-w-sm text-xs text-[var(--muted)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
