"use client";

import { useState } from "react";
import { Play, Plus, PauseCircle } from "lucide-react";
import { useApi, apiFetch } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner, Modal, Field, Empty, fmtDate } from "@/components/ui";

interface Profile {
  id: string; title: string; frequency: string; intervalDays: number | null;
  nextRunDate: string; autoSend: boolean; endCycles: number | null;
  endDate: string | null; cyclesRun: number; active: boolean; currency: string;
  client: { name: string };
  _count?: { invoices: number };
}
interface ClientOpt { id: string; name: string; currency: string }

export default function RecurringPage() {
  const { data, error, loading, refetch } = useApi<Profile[]>("/api/recurring-profiles");
  const clients = useApi<ClientOpt[]>("/api/clients");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // creation form state
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [intervalDays, setIntervalDays] = useState("14");
  const [nextRunDate, setNextRunDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [autoSend, setAutoSend] = useState(true);
  const [endCycles, setEndCycles] = useState("");
  const [itemsJson, setItemsJson] = useState(
    '[{ "description": "Service retainer", "quantity": 1, "unitPriceCents": 180000 }]'
  );

  async function create() {
    setBusy(true);
    setFormError(null);
    try {
      await apiFetch("/api/recurring-profiles", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          title,
          frequency,
          intervalDays: frequency === "CUSTOM_DAYS" ? parseInt(intervalDays) : null,
          nextRunDate,
          autoSend,
          endCycles: endCycles ? parseInt(endCycles) : null,
          currency: clients.data?.find((c) => c.id === clientId)?.currency ?? "USD",
          items: JSON.parse(itemsJson),
        }),
      });
      setOpen(false);
      await refetch();
    } catch (e) {
      setFormError(
        `Creation failed — ${(e as Error).message}. Items must be JSON like [{"description":"…","quantity":1,"unitPriceCents":15000}]`
      );
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: object) {
    try {
      await apiFetch(`/api/recurring-profiles/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function runNow(p: Profile) {
    try {
      const r = await apiFetch<{ recurringDetails: Array<{ generated: number }> }>(
        `/api/recurring-profiles/${p.id}/run`, { method: "POST" });
      alert(`${p.title}: ${r.recurringDetails.reduce((a, x) => a + x.generated, 0)} invoice(s) generated.`);
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(p: Profile) {
    if (!confirm(`Delete profile “${p.title}”? Profiles with history are deactivated instead.`)) return;
    try {
      await apiFetch(`/api/recurring-profiles/${p.id}`, { method: "DELETE" });
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const FREQ = [
    ["WEEKLY", "Weekly"], ["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"],
    ["ANNUALLY", "Annually"], ["CUSTOM_DAYS", "Custom interval (days)"],
  ];

  return (
    <>
      <PageHeader
        title="Recurring billing"
        subtitle="Subscription & scheduled invoices — generated on every scheduler tick (§3.1 / §13)"
        actions={
          <button onClick={() => { setClientId(clients.data?.[0]?.id ?? ""); setOpen(true); }}
            className="btn-primary"><Plus size={15} /> New profile</button>
        }
      />

      {error && <ErrorBanner message={error} />}
      {loading && !data ? <Spinner /> : null}
      {!loading && data && data.length === 0 && (
        <Empty hint="Create a profile to auto-generate invoices on a schedule." />
      )}

      {data && data.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th className="th">Profile</th>
                <th className="th">Client</th>
                <th className="th">Cadence</th>
                <th className="th">Next run</th>
                <th className="th text-right">Cycles</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50/60 ${p.active ? "" : "opacity-60"}`}>
                  <td className="td">
                    <span className="font-semibold text-slate-800">{p.title}</span>
                    <span className={`badge ml-2 ${p.autoSend ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-slate-100 text-slate-600 ring-slate-300"}`}>
                      {p.autoSend ? "auto-send" : "draft"}
                    </span>
                  </td>
                  <td className="td text-slate-600">{p.client.name}</td>
                  <td className="td text-xs">
                    <span className="badge bg-purple-50 text-purple-700 ring-purple-300">
                      {p.frequency === "CUSTOM_DAYS" ? `Every ${p.intervalDays}d` : p.frequency.toLowerCase()}
                    </span>
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{fmtDate(p.nextRunDate)}</td>
                  <td className="td text-right tabular-nums text-slate-500">
                    {p.cyclesRun}{p.endCycles != null ? ` / ${p.endCycles}` : ""}
                  </td>
                  <td className="td">
                    <span className={`badge ${p.active ? "bg-blue-50 text-blue-700 ring-blue-300" : "bg-zinc-200 text-zinc-600 ring-zinc-400"}`}>
                      {p.active ? "active" : "paused"}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => runNow(p)} disabled={!p.active}
                        className="btn-secondary btn-sm"><Play size={12} /> Run</button>
                      <button onClick={() => patch(p.id, { active: !p.active })}
                        className="btn-secondary btn-sm"><PauseCircle size={12} />{p.active ? "Pause" : "Resume"}</button>
                      <button onClick={() => remove(p)}
                        className="btn-secondary btn-sm !text-red-600">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New recurring profile" wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monthly design retainer…" /></Field>
          <Field label="Client *">
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {(clients.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name} ({c.currency})</option>))}
            </select>
          </Field>
          <Field label="Frequency">
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FREQ.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
            </select>
          </Field>
          {frequency === "CUSTOM_DAYS" && (
            <Field label="Interval (days)">
              <input className="input" type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
            </Field>
          )}
          <Field label="First run date">
            <input className="input" type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} />
          </Field>
          <Field label="Stop after N cycles (blank = never)">
            <input className="input" type="number" min={1} value={endCycles} onChange={(e) => setEndCycles(e.target.value)} />
          </Field>
          <Field label="Line items (JSON)" className="sm:col-span-2">
            <textarea className="input font-mono text-xs" rows={3} value={itemsJson} onChange={(e) => setItemsJson(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300" />
            Send automatically when generated
          </label>
        </div>
        {formError && <div className="mt-3"><ErrorBanner message={formError} /></div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={create} disabled={busy || !title || !clientId} className="btn-primary">
            {busy ? "Creating…" : "Create profile"}
          </button>
        </div>
      </Modal>
    </>
  );
}

