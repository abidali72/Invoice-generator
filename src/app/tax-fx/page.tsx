"use client";

import { useState } from "react";
import { useApi, apiFetch } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner } from "@/components/ui";
import { SimpleCrud } from "@/components/SimpleCrud";
import type { CrudColumn, CrudField } from "@/components/SimpleCrud";

/* ── Tax rates tab ── */

interface TaxRow {
  id: string; name: string; ratePercent: number;
  region: string | null; type: string;
}

const taxFields: CrudField[] = [
  { key: "name", label: "Name", kind: "text", required: true },
  { key: "ratePercent", label: "Rate %", kind: "number", required: true },
  {
    key: "type", label: "Price mode", kind: "select",
    options: [
      { value: "EXCLUSIVE", label: "Exclusive (added on top)" },
      { value: "INCLUSIVE", label: "Inclusive (extracted from price)" },
    ],
  },
  { key: "region", label: "Region / jurisdiction", kind: "text" },
];

const taxColumns: CrudColumn<TaxRow>[] = [
  { key: "name", header: "Rate name", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
  { key: "ratePercent", header: "%", align: "right", render: (r) => <span className="tabular-nums font-semibold">{r.ratePercent}%</span> },
  {
    key: "type", header: "Mode",
    render: (r) => (
      <span className={`badge ${r.type === "INCLUSIVE" ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-blue-50 text-blue-700 ring-blue-300"}`}>
        {r.type.toLowerCase()}
      </span>
    ),
  },
  { key: "region", header: "Region", render: (r) => <span className="text-xs text-slate-500">{r.region}</span> },
];

function TaxRatesCrud() {
  return (
    <SimpleCrud<TaxRow>
      title="Tax rates"
      subtitle="Jurisdiction rules — applied per invoice line with INCLUSIVE/EXCLUSIVE stacking (§3.4)"
      singular="Tax rate"
      endpoint="/api/tax-rates"
      fields={taxFields}
      columns={taxColumns}
    />
  );
}

/* ── FX tab ── */

interface RateRow { code: string; symbol: string; name: string; rateToBase: number }

function FxPanel() {
  const { data, error, loading, refetch } = useApi<RateRow[]>("/api/currencies");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busyCode, setBusyCode] = useState<string | null>(null);

  async function save(code: string) {
    setBusyCode(code);
    try {
      await apiFetch("/api/currencies", {
        method: "PUT",
        body: JSON.stringify({
          code,
          rateToBase: parseFloat(edit[code] ?? String(data?.find((r) => r.code === code)?.rateToBase ?? "")),
        }),
      });
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyCode(null);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Exchange-rate source is manual in this MVP — every invoice stores an immutable snapshot at creation (§12).
        Base currency: <b className="text-slate-700">USD</b>.
      </p>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50/70">
            <tr>
              <th className="th">Currency</th>
              <th className="th">Symbol</th>
              <th className="th text-right">Rate → USD</th>
              <th className="th text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data ?? []).map((r) => (
              <tr key={r.code}>
                <td className="td">
                  <span className="font-bold text-slate-800">{r.code}</span>
                  <span className="ml-2 text-xs text-slate-500">{r.name}</span>
                </td>
                <td className="td text-slate-600">{r.symbol}</td>
                <td className="td text-right tabular-nums font-medium">{r.rateToBase}</td>
                <td className="td text-right">
                  <div className="flex justify-end items-center gap-2">
                    <input
                      className="input !w-28 !py-1.5 text-right"
                      value={edit[r.code] ?? String(r.rateToBase)}
                      onChange={(e) => setEdit((s) => ({ ...s, [r.code]: e.target.value }))}
                      inputMode="decimal"
                    />
                    <button
                      disabled={busyCode === r.code || (edit[r.code] ?? "") === ""}
                      onClick={() => save(r.code)}
                      className="btn-secondary btn-sm"
                    >
                      Save
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TaxFxPage() {
  const [tab, setTab] = useState<"taxes" | "fx">("taxes");
  return (
    <>
      <PageHeader title="Tax & FX" subtitle="Smart tax engine and multi-currency configuration" />
      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {([["taxes", "Tax rates"], ["fx", "Exchange rates"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === k ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "taxes" ? <TaxRatesCrud /> : <FxPanel />}
    </>
  );
}
