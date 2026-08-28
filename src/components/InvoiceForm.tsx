"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/hooks";
import { computeInvoice, formatMoney } from "@/lib/money";
import type { DiscountType } from "@/lib/types";
import { ErrorBanner } from "@/components/ui";

export interface ClientOpt { id: string; name: string; currency: string }
export interface ProductOpt {
  id: string; name: string; description: string | null;
  unitPriceCents: number; taxRateId: string | null;
  active?: boolean;
}
export interface TaxOpt { id: string; name: string; ratePercent: number; type: string }

export interface FormLine {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateId: string;
}

const emptyLine = (): FormLine => ({
  productId: "", description: "", quantity: "1", unitPrice: "0", taxRateId: "",
});

/**
 * Invoice builder — live totals via the SAME pure engine the API and PDF
 * renderer use (src/lib/money.ts), so screen always equals stored truth.
 */
export function InvoiceForm({
  clients, products, taxRates,
  initial, invoiceId,
}: {
  clients: ClientOpt[];
  products: ProductOpt[];
  taxRates: TaxOpt[];
  initial?: {
    clientId: string; issueDate: string; dueDate: string;
    lines: FormLine[]; discountType: DiscountType | ""; discountValue: string;
    notes: string; terms: string; poNumber: string;
  };
  invoiceId?: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayIso());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? plus30Iso());
  const [lines, setLines] = useState<FormLine[]>(initial?.lines?.length ? initial.lines : [emptyLine()]);
  const [discountType, setDiscountType] = useState<DiscountType | "">(initial?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState<string>(initial?.discountValue ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [poNumber, setPoNumber] = useState(initial?.poNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const client = clients.find((c) => c.id === clientId);
  const currency = client?.currency ?? "USD";

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const preview = useMemo(() => {
    return computeInvoice(
      lines.map((l) => {
        const tr = taxRates.find((t) => t.id === l.taxRateId);
        return {
          quantity: parseFloat(l.quantity) || 0,
          unitPriceCents: Math.round((parseFloat(l.unitPrice.replace(/,/g, "")) || 0) * 100),
          taxRatePercent: tr?.ratePercent ?? 0,
          taxType: (tr?.type ?? "EXCLUSIVE") as any,
        };
      }),
      discountType && discountValue !== ""
        ? { type: discountType as any, value: parseFloat(discountValue) || 0 }
        : { type: null, value: null }
    );
  }, [lines, discountType, discountValue, taxRates]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  function updateLine(i: number, patch: Partial<FormLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickProduct(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) { updateLine(i, { productId: "" }); return; }
    updateLine(i, {
      productId,
      description: p.description || p.name,
      unitPrice: (p.unitPriceCents / 100).toFixed(2),
      ...(p.taxRateId ? { taxRateId: p.taxRateId } : {}),
    });
  }

  async function submit() {
    setError(null);
    if (!clientId) return setError("Choose a client.");
    const payloadLines = lines
      .filter((l) => l.description.trim() && parseFloat(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId || null,
        description: l.description.trim(),
        quantity: parseFloat(l.quantity),
        unitPrice: l.unitPrice.replace(/,/g, ""),
        taxRateId: l.taxRateId || null,
      }));
    if (!payloadLines.length) return setError("Add at least one valid line item.");

    const body = {
      clientId,
      currency,
      issueDate,
      dueDate,
      items: payloadLines,
      discountType: discountType || null,
      discountValue: discountType && discountValue !== "" ? parseFloat(discountValue) : null,
      notes: notes || null,
      terms: terms || null,
      poNumber: poNumber || null,
    };

    setSaving(true);
    try {
      if (invoiceId) {
        await apiFetch(`/api/invoices/${invoiceId}`, { method: "PUT", body: JSON.stringify(body) });
        router.push(`/invoices/${invoiceId}`);
      } else {
        const inv = await apiFetch<{ id: string }>("/api/invoices", {
          method: "POST", body: JSON.stringify(body),
        });
        router.push(`/invoices/${inv.id}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="card card-pad grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input">
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Issue date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
          </div>
        </div>

        {/* line items */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-900">Line items</h3>
            <button onClick={() => setLines((l) => [...l, emptyLine()])} className="btn-secondary btn-sm">
              <Plus size={13} /> Add line
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2 p-4">
                <div className="col-span-12 sm:col-span-3">
                  <select aria-label="Product" value={l.productId}
                    onChange={(e) => pickProduct(i, e.target.value)}
                    className="input !py-1.5 text-xs">
                    <option value="">Custom…</option>
                    {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </div>
                <div className="col-span-12 sm:col-span-4">
                  <input aria-label="Description" value={l.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    placeholder="Description" className="input !py-1.5" />
                </div>
                <div className="col-span-6 sm:col-span-1">
                  <input aria-label="Quantity" value={l.quantity} inputMode="decimal"
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    placeholder="Qty" className="input !py-1.5 text-right" />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <input aria-label="Unit price" value={l.unitPrice} inputMode="decimal"
                    onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                    placeholder="0.00" className="input !py-1.5 text-right" />
                </div>
                <div className="col-span-10 sm:col-span-1">
                  <select aria-label="Tax" value={l.taxRateId}
                    onChange={(e) => updateLine(i, { taxRateId: e.target.value })}
                    className="input !py-1.5 text-xs">
                    <option value="">No tax</option>
                    {taxRates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.ratePercent}%{t.type === "INCLUSIVE" ? " incl" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button"
                  onClick={() => setLines((ls) => ls.filter((_, x) => x !== i))}
                  className="col-span-2 justify-self-end rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove line"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Extras</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">PO number</label>
              <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Discount type</label>
              <select value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType | "")}
                className="input">
                <option value="">None</option>
                <option value="PERCENT">Percentage</option>
                <option value="FIXED">Fixed amount</option>
              </select>
            </div>
            {discountType && (
              <div>
                <label className="label">{discountType === "PERCENT" ? "Percent" : `Amount (${currency})`}</label>
                <input value={discountValue} inputMode="decimal"
                  onChange={(e) => setDiscountValue(e.target.value)} className="input" />
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" />
            </div>
            <div>
              <label className="label">Terms</label>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className="input" />
            </div>
          </div>
        </div>
      </div>

      {/* sticky totals rail */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Live summary</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatMoney(preview.subtotalCents, currency)} />
            {preview.discountTotalCents > 0 && (
              <Row label="Discount" value={`− ${formatMoney(preview.discountTotalCents, currency)}`} tone="text-emerald-600" />
            )}
            <Row label="Total tax" value={formatMoney(preview.taxTotalCents, currency)} />
            <div className="!mt-3 border-t border-slate-200 pt-3">
              <Row label="Grand total" value={formatMoney(preview.grandTotalCents, currency)} bold />
            </div>
          </dl>

          {error && <ErrorBanner message={error} />}

          <button onClick={submit} disabled={saving} className="btn-primary mt-4 w-full">
            {saving ? "Saving…" : invoiceId ? "Save changes" : "Create draft"}
          </button>
          <p className="mt-2 text-center text-[11px] leading-snug text-slate-400">
            Number is allocated sequentially on save and never re-used.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold text-slate-900" : `text-slate-600 ${tone ?? ""}`}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function plus30Iso() {
  return new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
}
