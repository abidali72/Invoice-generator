"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useApi, apiFetch } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner, Modal, Field, Empty } from "@/components/ui";

export type FieldKind = "text" | "email" | "textarea" | "number" | "select";

export interface CrudField {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  span?: 1 | 2;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export interface CrudColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => React.ReactNode;
  align?: "right" | "left";
}

/**
 * Generic create/read/update/delete manager backing the catalog screens.
 * Talks straight to the REST endpoints so the API stays the single source of truth.
 */
export function SimpleCrud<Row extends { id: string }>({
  title, subtitle, singular, endpoint,
  fields, columns,
}: {
  title: string;
  subtitle?: string;
  singular: string;
  endpoint: string;
  fields: CrudField[];
  columns: CrudColumn<Row>[];
}) {
  const { data, error, loading, refetch } = useApi<Row[]>(endpoint);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<any>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setEditingId(null);
    setForm(Object.fromEntries(
      fields.map((f) => [f.key, f.kind === "select" ? (f.options?.[0]?.value ?? "") : ""])
    ));
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: Row) {
    setEditingId(row.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = row as any;
    setForm(Object.fromEntries(fields.map((f) => [f.key, rec[f.key] ?? ""])));
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setFormError(null);
    try {
      if (editingId) await apiFetch(`${endpoint}/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
      else await apiFetch(endpoint, { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      await refetch();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Row) {
    if (!confirm(`Delete this ${singular.toLowerCase()}? The server may refuse when records depend on it.`)) return;
    try {
      await apiFetch(`${endpoint}/${row.id}`, { method: "DELETE" });
      await refetch();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function valid() {
    return fields.every((f) => !f.required || String(form[f.key] ?? "").trim().length > 0);
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<button onClick={openNew} className="btn-primary"><Plus size={15} /> New {singular.toLowerCase()}</button>}
      />

      {error && <ErrorBanner message={error} />}
      {loading && !data ? <Spinner /> : null}
      {!loading && (!data || data.length === 0) && (
        <Empty hint={`No ${title.toLowerCase()} yet.`} />
      )}

      {data && data.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`th ${c.align === "right" ? "text-right" : ""}`}>{c.header}</th>
                ))}
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  {columns.map((c) => (
                    <td key={c.key} className={`td ${c.align === "right" ? "text-right" : ""}`}>
                      {c.render(row)}
                    </td>
                  ))}
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => openEdit(row)} aria-label="Edit"
                        className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={14} /></button>
                      <button onClick={() => remove(row)} aria-label="Delete"
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}
        title={editingId ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} className={f.span === 2 ? "sm:col-span-2" : ""}>
              {f.kind === "textarea" ? (
                <textarea className="input" rows={3} value={form[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm((s: Record<string, unknown>) => ({ ...s, [f.key]: e.target.value }))} />
              ) : f.kind === "select" ? (
                <select className="input" value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s: Record<string, unknown>) => ({ ...s, [f.key]: e.target.value }))}>
                  {f.options?.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              ) : (
                <input className="input" type={f.kind === "number" ? "number" : f.kind === "email" ? "email" : "text"}
                  step={f.kind === "number" ? "any" : undefined}
                  value={form[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => setForm((s: Record<string, unknown>) => ({ ...s, [f.key]: e.target.value }))} />
              )}
            </Field>
          ))}
        </div>
        {formError && <div className="mt-3"><ErrorBanner message={formError} /></div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy || !valid()} className="btn-primary">
            {busy ? "Saving…" : editingId ? "Save changes" : "Create"}
          </button>
        </div>
      </Modal>
    </>
  );
}

