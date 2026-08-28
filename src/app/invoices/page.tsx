"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Download } from "lucide-react";
import { useApi, apiFetch } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { INVOICE_STATUSES } from "@/lib/types";
import { PageHeader, StatusPill, Spinner, ErrorBanner, Empty, fmtDate } from "@/components/ui";

interface Row {
  id: string;
  invoiceNumber: string;
  status: string;
  client: { id: string; name: string };
  issueDate: string;
  dueDate: string;
  currency: string;
  grandTotalCents: number;
}

export default function InvoicesPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const query = `/api/invoices?take=200${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, error, loading, refetch } = useApi<Row[]>(query);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "send" | "void") {
    if (action === "void" && !confirm("Void this invoice? It is excluded from financial totals.")) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/invoices/${id}/${action}`, { method: "POST" });
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Full lifecycle management — draft through paid"
        actions={
          <Link href="/invoices/new" className="btn-primary">
            <Plus size={15} /> New invoice
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search number…"
          className="input max-w-56"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input max-w-44">
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && !data ? <Spinner /> : data && data.length === 0
        ? <Empty hint="Create your first invoice to start billing." />
        : null}

      {data && data.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th className="th">Number</th>
                <th className="th">Client</th>
                <th className="th">Issued</th>
                <th className="th">Due</th>
                <th className="th text-right">Total</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60">
                  <td className="td">
                    <Link href={`/invoices/${inv.id}`} className="font-semibold text-blue-600 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="td text-slate-700">{inv.client.name}</td>
                  <td className="td text-slate-500">{fmtDate(inv.issueDate)}</td>
                  <td className="td text-slate-500">{fmtDate(inv.dueDate)}</td>
                  <td className="td text-right font-semibold tabular-nums">
                    {formatMoney(inv.grandTotalCents, inv.currency)}
                  </td>
                  <td className="td"><StatusPill status={inv.status} /></td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      {inv.status === "DRAFT" && (
                        <button onClick={() => act(inv.id, "send")} disabled={busyId === inv.id}
                          className="btn-secondary btn-sm">Send</button>
                      )}
                      {!["VOID", "PAID", "DRAFT"].includes(inv.status) && (
                        <>
                          <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                            <Download size={12} /> PDF
                          </a>
                          <button onClick={() => act(inv.id, "void")} disabled={busyId === inv.id}
                            className="btn-secondary btn-sm !text-red-600">Void</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
