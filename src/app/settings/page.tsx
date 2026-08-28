"use client";

import { useEffect, useState } from "react";
import { useApi, apiFetch } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner, Field } from "@/components/ui";
import type { Entity } from "@prisma/client";

export default function SettingsPage() {
  const { data, error, loading, refetch } = useApi<Entity>("/api/settings");
  const [form, setForm] = useState<Partial<Entity>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          // inputs arrive as strings; coerce numerics for the API contract
          ...(f.seqPad !== undefined ? { seqPad: Number(f.seqPad) } : {}),
        }),
      });
      await refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const f = form as Record<string, unknown>;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Company profile used on invoices, PDF letterhead and numbering"
        actions={
          <>
            {saved && <span className="text-xs font-semibold text-emerald-600">✓ Saved</span>}
            <button onClick={save} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save changes"}</button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Company</h3>
          <Field label="Display name"><input className="input" value={(f.name as string) ?? ""} onChange={set("name")} /></Field>
          <Field label="Legal name"><input className="input" value={(f.legalName as string) ?? ""} onChange={set("legalName")} /></Field>
          <Field label="Tax ID"><input className="input" value={(f.taxId as string) ?? ""} onChange={set("taxId")} /></Field>
          <Field label="Address"><textarea className="input" rows={3} value={(f.address as string) ?? ""} onChange={set("address")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><input className="input" value={(f.email as string) ?? ""} onChange={set("email")} /></Field>
            <Field label="Phone"><input className="input" value={(f.phone as string) ?? ""} onChange={set("phone")} /></Field>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card card-pad space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Invoicing defaults</h3>
            <Field label="Default currency" hint="Also the reporting base currency">
              <select className="input" value={(f.defaultCurrency as string) ?? "USD"} onChange={set("defaultCurrency")}>
                {["USD", "EUR", "GBP", "AED", "PKR", "CAD", "AUD", "INR"].map((c) => (<option key={c}>{c}</option>))}
              </select>
            </Field>
            <Field label="Invoice number template" hint="{YEAR} and {SEQ} placeholders; sequential & immutable once issued (§11)">
              <input className="input font-mono text-sm" value={(f.invoicePrefix as string) ?? ""} onChange={set("invoicePrefix")} />
            </Field>
            <Field label="Sequence padding">
              <input className="input" type="number" min={2} max={8}
                value={String(f.seqPad ?? 4)} onChange={set("seqPad")} />
            </Field>
            <Field label="Bank details / payment instructions"><textarea className="input" rows={3} value={(f.bankDetails as string) ?? ""} onChange={set("bankDetails")} /></Field>
            <Field label="Footer text"><input className="input" value={(f.footerText as string) ?? ""} onChange={set("footerText")} /></Field>
          </div>

          <div className="card card-pad">
            <h3 className="mb-1 text-sm font-bold text-slate-900">Scheduler</h3>
            <p className="text-xs leading-relaxed text-slate-500">
              Recurring generation, overdue sweeps and reminder dispatch run inside
              <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">POST /api/cron/tick</code>.
              The Dashboard button triggers it manually; wire a cron job or BullMQ repeatable to this
              endpoint in production for hands-free operation.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
