"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner, Empty } from "@/components/ui";

interface LogRow {
  id: string; entityType: string; entityId: string; actor: string;
  action: string; summary: string; changesJson: string | null; timestamp: string;
}

const TYPES = ["INVOICE", "CLIENT", "PRODUCT", "TAX_RATE", "PAYMENT",
  "CREDIT_NOTE", "RECURRING_PROFILE", "REMINDER", "SETTINGS"];

const ACTION_CLS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  UPDATE: "bg-blue-50 text-blue-700 ring-blue-300",
  DELETE: "bg-red-50 text-red-700 ring-red-300",
  SEND: "bg-indigo-50 text-indigo-700 ring-indigo-300",
  VIEW: "bg-sky-50 text-sky-700 ring-sky-300",
  VOID: "bg-zinc-200 text-zinc-600 ring-zinc-400",
  PAYMENT_RECORDED: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  GENERATE: "bg-purple-50 text-purple-700 ring-purple-300",
  DISPATCH: "bg-amber-50 text-amber-700 ring-amber-300",
};

export default function AuditLogPage() {
  const [type, setType] = useState("");
  const query = `/api/audit-logs?take=300${type ? `&entityType=${type}` : ""}`;
  const { data, error, loading } = useApi<LogRow[]>(query);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Immutable record of who changed what and when (§3.16 / §15)"
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button onClick={() => setType("")}
          className={`btn-sm btn ${type === "" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"}`}>
          All
        </button>
        {TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`btn-sm btn ${type === t ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"}`}>
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && !data ? <Spinner /> : null}
      {!loading && data && data.length === 0 && <Empty hint="No audit entries match." />}

      {data && data.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th className="th">When</th>
                <th className="th">Entity</th>
                <th className="th">Action</th>
                <th className="th">Summary</th>
                <th className="th">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/60">
                  <td className="td whitespace-nowrap text-xs text-slate-400">
                    {new Date(l.timestamp).toLocaleString()}
                  </td>
                  <td className="td">
                    <span className="badge bg-slate-100 text-slate-600 ring-slate-300">
                      {l.entityType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="td">
                    <span className={`badge ${ACTION_CLS[l.action] ?? "bg-slate-100 text-slate-600 ring-slate-300"}`}>
                      {l.action.replace("_", " ")}
                    </span>
                  </td>
                  <td className="td max-w-lg truncate text-slate-700" title={l.summary}>{l.summary}</td>
                  <td className="td text-xs text-slate-400">{l.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
