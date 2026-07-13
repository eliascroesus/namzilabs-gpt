import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import Link from "next/link";

export type PipelineConnection = {
  id: string;
  name: string;
  provider: string;
  status: string;
  freshness: string;
  lastSuccessfulSyncAt: Date | null;
};

function dateLabel(value: Date | null): string {
  return value ? value.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

export function DataPipeline({ connections }: { connections: PipelineConnection[] }) {
  return (
    <section className="shell-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line)] p-5">
        <div>
          <h2 className="text-sm font-semibold">Data pipeline</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Connection state and most recent successful synchronization.
          </p>
        </div>
        <span className="status-pill">
          <span className="status-dot bg-[var(--success)]" /> Monitoring
        </span>
      </div>
      {connections.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Provider</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last successful sync</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => {
                const healthy =
                  connection.status === "active" &&
                  !["delayed", "unavailable"].includes(connection.freshness);
                return (
                  <tr className="border-t border-[var(--line)]" key={connection.id}>
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/integrations/${connection.id}`}>{connection.name}</Link>
                    </td>
                    <td className="px-5 py-3 capitalize text-[var(--muted)]">
                      {connection.provider.replaceAll("-", " ")}
                    </td>
                    <td className="px-5 py-3">
                      <span className={healthy ? "text-emerald-300" : "text-amber-300"}>
                        {healthy ? (
                          <CheckCircle2 size={13} className="mr-1 inline" />
                        ) : (
                          <AlertTriangle size={13} className="mr-1 inline" />
                        )}
                        {connection.status} · {connection.freshness}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[var(--muted)]">
                      <Clock3 size={13} className="mr-1 inline" />{" "}
                      {dateLabel(connection.lastSuccessfulSyncAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-6 py-12 text-center text-sm text-[var(--muted)]">
          No source accounts connected yet.
        </div>
      )}
    </section>
  );
}
