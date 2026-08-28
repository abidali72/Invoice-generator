"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useApi, apiFetch } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner, Empty, fmtDate } from "@/components/ui";

interface Reminder {
  id: string; type: string; subject: string; body: string;
  scheduledAt: string; sentAt: string | null; status: string;
  invoice: { invoiceNumber: string; status: string; currency: string; grandTotalCents: number };
}

const badge = (r: Reminder) =>
  r.status === "SENT" ? "bg-blue-50 text-blue-700 ring-blue-300"
  : r.status === "CANCELLED" ? "bg-zinc-200 text-zinc-600 ring-zinc-400"
  : "bg-amber-50 text-amber-700 ring-amber-300";

export default function RemindersPage() {
  const [tab, setTab] = useState<"PENDING" | "SENT">("PENDING");
  const { data, error, loading, refetch } = useApi<Reminder[]>(`/api/reminders${tab !== "SENT" ? "?status=PENDING" : "?status=SENT"}`);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function dispatch() {
    setBusy(true);
    setResult(null);
    try {
      const r = await apiFetch<{ dispatched: number; pendingLeft: number }>("/api/reminders/dispatch", { method: "POST" });
      setResult(`Dispatched ${r.dispatched} reminder(s); ${r.pendingLeft} still pending.`);
      await refetch();
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Reminders"
        subtitle="Dunning schedule per sent invoice — escalate −3d → due → +7/+14/+30d (§3.9)"
        actions={
          tab === "PENDING" && (
            <>
              {result && <span className="text-xs font-medium text-slate-500">{result}</span>}
              <button onClick={dispatch} disabled={busy} className="btn-primary"><Send size={14} /> Dispatch due now</button>
            </>
          )
        }
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {(["PENDING", "SENT"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold ${
              tab === t ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}>
            {t === "PENDING" ? "Scheduled" : "Sent / cancelled"}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && !data ? <Spinner /> : null}
      {!loading && data && data.length === 0 && (
        <Empty hint={`No ${tab.toLowerCase()} reminders. Schedules are created automatically when invoices are sent.`} />
      )}

      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((r) => (
            <div key={r.id} className="card card-pad !py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${badge(r)}`}>{r.type.replace("_", "-")}</span>
                    <span className="truncate text-sm font-semibold text-slate-800">{r.subject}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{r.body}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  <a href={`/invoices/${r.invoice.invoiceNumber}`} className="font-semibold text-blue-600 hover:underline">
                    {r.invoice.invoiceNumber}
                  </a>
                  <div>{r.sentAt ? `sent ${fmtDate(r.sentAt)}` : `due ${fmtDate(r.scheduledAt)}`}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
