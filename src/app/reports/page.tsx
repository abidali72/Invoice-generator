"use client";

import { Download } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { PageHeader, Spinner, ErrorBanner } from "@/components/ui";

interface AgingRow {
  invoiceId: string; invoiceNumber: string; clientName: string; currency: string;
  balanceLocalCents: number; balanceBaseCents: number; daysPastDue: number; bucket: string;
}
interface ReportData {
  aging: AgingRow[];
  revenue: Array<{ ym: string; invoicedBaseCents: number; collectedBaseCents: number }>;
  topClients: Array<{ clientId: string; name: string; baseCents: number; count: number }>;
  exposure: Array<{ currency: string; localBalanceCents: number; baseBalanceCents: number }>;
}

const EXPORTS = [
  ["aging", "AR aging"], ["revenue-by-month", "Revenue by month"],
  ["revenue-by-client", "Revenue by client"], ["currency-exposure", "Currency exposure"],
];

const bucketTone = (b: string) =>
  b === "90+" ? "bg-red-50 text-red-700 ring-red-300"
  : b === "61-90" ? "bg-orange-50 text-orange-700 ring-orange-300"
  : b === "31-60" ? "bg-amber-50 text-amber-700 ring-amber-300"
  : b === "0-30" ? "bg-yellow-50 text-yellow-700 ring-yellow-300"
  : "bg-blue-50 text-blue-700 ring-blue-300";

export default function ReportsPage() {
  const aging = useApi<{ rows: AgingRow[]; totalsByBucket: Record<string, number> }>("/api/reports/aging");
  const dash = useApi<{
    topClients: ReportData["topClients"]; exposure: ReportData["exposure"];
    revenue: ReportData["revenue"];
  }>("/api/reports/dashboard");

  if ((aging.loading && !aging.data) || (dash.loading && !dash.data)) return <Spinner />;
  if (aging.error) return <ErrorBanner message={aging.error} />;
  if (!aging.data || !dash.data) return null;

  const rows = aging.data.rows;
  const revenue = dash.data.revenue ?? [];
  const maxRev = Math.max(...revenue.map((r) => r.invoicedBaseCents), 1);

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        subtitle="Standard financial reports — exportable to CSV (§14)"
        actions={
          EXPORTS.map(([kind, label]) => (
            <a key={kind} href={`/api/export/${kind}`} className="btn-secondary btn-sm">
              <Download size={12} /> {label}
            </a>
          ))
        }
      />

      {/* Revenue by month */}
      <div className="card card-pad mb-4">
        <h3 className="mb-4 text-sm font-bold text-slate-900">Revenue by month — invoiced vs collected</h3>
        <div className="flex h-52 items-end gap-2">
          {revenue.map((r) => (
            <div key={r.ym} className="group relative flex flex-1 flex-col items-center justify-end h-full">
              <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                {r.ym} · in {formatMoney(r.invoicedBaseCents)} · col {formatMoney(r.collectedBaseCents)}
              </div>
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: "100%" }}>
                <div className="w-1/3 rounded-t bg-blue-500/80" style={{ height: `${(r.invoicedBaseCents / maxRev) * 100}%` }} />
                <div className="w-1/3 rounded-t bg-emerald-500/80" style={{ height: `${(r.collectedBaseCents / maxRev) * 100}%` }} />
              </div>
              <span className="mt-1 text-[9px] text-slate-400">{r.ym.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* AR aging */}
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-bold text-slate-900">Accounts-receivable aging</h3>
          </div>
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th className="th">Invoice</th>
                <th className="th">Client</th>
                <th className="th">Bucket</th>
                <th className="th text-right">Days late</th>
                <th className="th text-right">Balance</th>
                <th className="th text-right">Base</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.invoiceId} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-slate-800">{r.invoiceNumber}</td>
                  <td className="td text-slate-600">{r.clientName}</td>
                  <td className="td"><span className={`badge ${bucketTone(r.bucket)}`}>{r.bucket === "NOT_DUE" ? "not due" : `${r.bucket} d`}</span></td>
                  <td className="td text-right tabular-nums text-slate-500">{r.daysPastDue}</td>
                  <td className="td text-right tabular-nums">{formatMoney(r.balanceLocalCents, r.currency)}</td>
                  <td className="td text-right tabular-nums font-semibold">{formatMoney(r.balanceBaseCents)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="td py-8 text-center text-xs text-slate-400">No open receivables.</td></tr>
              )}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
            {Object.entries(aging.data.totalsByBucket).map(([b, cents]) => (
              <span key={b} className="text-xs text-slate-500">
                <b>{b === "NOT_DUE" ? "not due" : b + "d"}:</b> {formatMoney(cents)}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Top clients by revenue</h3>
            <ul className="space-y-1.5">
              {(dash.data.topClients ?? []).map((c) => (
                <li key={c.clientId} className="flex justify-between text-sm">
                  <span className="truncate text-slate-600">{c.name}</span>
                  <span className="tabular-nums font-semibold">{formatMoney(c.baseCents)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Currency exposure</h3>
            {(dash.data.exposure ?? []).length === 0
              ? <p className="text-xs text-slate-400">Nothing outstanding.</p>
              : (
                <ul className="space-y-1.5">
                  {(dash.data.exposure ?? []).map((e) => (
                    <li key={e.currency} className="flex justify-between text-sm">
                      <span className="font-semibold text-slate-700">{e.currency}</span>
                      <span className="tabular-nums text-slate-600">
                        {formatMoney(e.localBalanceCents, e.currency)}{" "}
                        <span className="text-slate-400">≈ {formatMoney(e.baseBalanceCents)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
