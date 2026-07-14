"use client";

import { Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshAllButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function refreshAll() {
    setState("working");
    setMessage(null);
    try {
      const response = await fetch("/api/connections/sync-all", { method: "POST" });
      const result = (await response.json()) as {
        data?: {
          connectionsRefreshed: number;
          recordsWritten: number;
          failed: { message: string }[];
        };
        error?: { message?: string };
      };
      if (!response.ok || !result.data) {
        throw new Error(result.error?.message ?? "Data refresh failed.");
      }
      const failures = result.data.failed.length;
      setMessage(
        failures
          ? `${result.data.connectionsRefreshed} sources refreshed; ${failures} need attention.`
          : `${result.data.recordsWritten.toLocaleString()} records synchronized.`,
      );
      setState(failures ? "error" : "done");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data refresh failed.");
      setState("error");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void refreshAll()}
        disabled={state === "working"}
        className={compact ? "text-button" : "secondary-link"}
        title="Pull the latest data from every active source"
      >
        {state === "working" ? (
          <LoaderCircle size={15} className="animate-spin" />
        ) : state === "done" ? (
          <Check size={15} />
        ) : (
          <RefreshCw size={15} />
        )}
        {state === "working" ? "Syncing…" : compact ? "Refresh" : "Refresh all data"}
      </button>
      {message ? (
        <div
          role="status"
          className={`refresh-toast absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border p-3 text-xs shadow-2xl ${state === "error" ? "refresh-toast-error" : "refresh-toast-success"}`}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
