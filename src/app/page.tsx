"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FileText,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { useApi, apiFetch } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { PageHeader, StatusPill, Spinner, ErrorBanner, fmtDate } from "@/components/ui";

interface DashData {
  summary: {
    invoicedBaseCents: number;
    collectedBaseCents: number;
    outstandingBaseCents: number;
    overdueBaseCents: number;
    cashflowForecast: Array<{ withinDays: string; baseCents: number }>;
  };
  buckets: Array<{ bucket: string; baseCents: number; count: number }>;
  revenue: Array<{ ym: string; invoicedBaseCents: number; collectedBaseCents: number }>;
  topClients: Array<{ clientId: string; name: string; baseCents: number; count: number }>;
  methods: Array<{ method: string; baseCents: number; count: number }>;
  recent: Array<{
    id: string; invoiceNumber: string; status: string; client: { name: string };
    grandTotalCents: number; currency: string; dueDate: string;
  }>;
}

const KPI = ({
  label, cents, icon: Icon, tone,
}: {
  label: string; cents: number; icon: React.ElementType; tone: string;
}) => (
  <div className="card card-pad">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Icon size={16} className={tone} />
    </div>
    <div className="kpi-value">{formatMoney(cents)}</div>
    <div className="text-[11px] text-slate-400">base currency · all-time</div>
  </div>
);

export default function DashboardPage() {
  const { data, error, loading, refetch } = useApi<DashData>("/api/reports/dashboard");
  const [tickResult, setTickResult] = useState<string | null>(null);
  const [ticking, setTicking] = useState(false);

  async function runTick() {
    setTicking(true);
    setTickResult(null);
    try {
      const r = await apiFetch<{
        markedOverdue: number; recurringGenerated: number; remindersSent: number;
      }>("/api/cron/tick", { method: "POST" });
      setTickResult(
        `Scheduler ✓ — overdue: ${r.markedOverdue} · recurring: ${r.recurringGenerated} · reminders: ${r.remindersSent}`
      );
      await refetch();
    } catch (e) {
      setTickResult(`Scheduler failed: ${(e as Error).message}`);
    } finally {
      setTicking(false);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { summary, buckets, revenue, topClients, recent, methods } = data;
  const maxRevenue = Math.max(
    ...revenue.map((r) => Math.max(r.invoicedBaseCents, r.collectedBaseCents)), 1
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Acme Studio LLC · receivables overview"
        actions={
          <>
            {tickResult && (
              <span className="max-w-md truncate text-xs font-medium text-slate-500">{tickResult}</span>
            )}
            <button onClick={runTick} disabled={ticking} className="btn-secondary">
              <Zap size={14} className={ticking ? "animate-pulse" : ""} />
              Run scheduler tick
            </button>
            <Link href="/invoices/new" className="btn-primary">New invoice</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Invoiced" cents={summary.invoicedBaseCents} icon={FileText} tone="text-blue-600" />
        <KPI label="Collected" cents={summary.collectedBaseCents} icon={ArrowDownRight} tone="text-emerald-600" />
        <KPI label="Outstanding" cents={summary.outstandingBaseCents} icon={Clock} tone="text-amber-600" />
        <KPI label="Overdue" cents={summary.overdueBaseCents} icon={AlertTriangle} tone="text-red-600" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Revenue chart */}
        <div className="card card-pad lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-slate-900">Invoiced vs collected — last 12 months</h3>
            <span className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> invoiced</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> collected</span>
            </span>
          </div>
          <div className="flex h-44 items-end gap-1.5">
            {revenue.map((r) => (
              <div key={r.ym} className="group relative flex flex-1 flex-col items-end justify-end" style={{ height: "100%" }}>
                <div className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                  {r.ym}: {formatMoney(r.invoicedBaseCents)} / {formatMoney(r.collectedBaseCents)}
                </div>
                <div
                  className="w-1/3 rounded-t bg-blue-500/80 hover:bg-blue-600"
                  style={{ height: `${(r.invoicedBaseCents / maxRevenue) * 100}%`, minHeight: r.invoicedBaseCents ? 3 : 0 }}
                />
                <div
                  className="mt-px w-1/3 rounded-t bg-emerald-500/80 hover:bg-emerald-600"
                  style={{ height: `${(r.collectedBaseCents / maxRevenue) * 100}%`, minHeight: r.collectedBaseCents ? 3 : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {revenue.map((r) => (
              <div key={r.ym} className="flex-1 text-center text-[9px] text-slate-400">{r.ym.slice(5)}</div>
            ))}
          </div>
        </div>

        {/* AR aging */}
        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-bold text-slate-900">AR aging (§14)</h3>
          <ul className="space-y-2.5">
            {buckets.map((b) => {
              const total = buckets.reduce((a, x) => a + x.baseCents, 0) || 1;
              return (
                <li key={b.bucket}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-slate-600">
                      {b.bucket === "NOT_DUE" ? "Not yet due" : `${b.bucket} days`}{" "}
                      <span className="text-slate-400">({b.count})</span>
                    </span>
                    <span className="tabular-nums text-slate-700">{formatMoney(b.baseCents)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={
                        b.bucket === "90+" ? "h-full rounded-full bg-red-500"
                        : b.bucket === "61-90" ? "h-full rounded-full bg-orange-400"
                        : b.bucket === "31-60" ? "h-full rounded-full bg-orange-300"
                        : b.bucket === "NOT_DUE" ? "h-full rounded-full bg-blue-400"
                        : "h-full rounded-full bg-yellow-400"
                      }
                      style={{ width: `${Math.max((b.baseCents / total) * 100, b.count ? 2 : 0)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <Link href="/reports" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
            Full reports →
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Recent invoices */}
        <div className="card lg:col-span-2">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-bold text-slate-900">Recent invoices</h3>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {recent.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link href={`/invoices/${inv.id}`} className="font-semibold text-blue-600 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="td text-slate-600">{inv.client.name}</td>
                  <td className="td tabular-nums font-medium">{formatMoney(inv.grandTotalCents, inv.currency)}</td>
                  <td className="td"><StatusPill status={inv.status} /></td>
                  <td className="td text-right text-xs text-slate-400">due {fmtDate(inv.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Side panels */}
        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Top clients</h3>
            <ul className="space-y-2">
              {topClients.map((c) => (
                <li key={c.clientId} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-slate-600">{c.name}</span>
                  <span className="shrink-0 tabular-nums font-semibold">{formatMoney(c.baseCents)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-bold text-slate-900">Payment mix</h3>
            {methods.length === 0 && <p className="text-xs text-slate-400">No payments recorded yet.</p>}
            <ul className="space-y-1.5">
              {methods.map((m) => (
                <li key={m.method} className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-slate-600">{m.method.replace("_", " ")}</span>
                  <span className="tabular-nums text-slate-500">{formatMoney(m.baseCents)} ({m.count})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Cash-flow forecast */}
      <div className="card card-pad mt-4">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Forecasted inflow (§14)</h3>
        <div className="grid grid-cols-3 gap-4">
          {summary.cashflowForecast.map((f) => (
            <div key={f.withinDays} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
              <div className="text-xs font-semibold text-slate-500">{f.withinDays}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatMoney(f.baseCents)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
