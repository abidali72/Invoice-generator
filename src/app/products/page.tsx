"use client";

import { useApi } from "@/lib/hooks";
import { formatMoney, centsToDecimalString } from "@/lib/money";
import { SimpleCrud } from "@/components/SimpleCrud";
import type { CrudColumn, CrudField } from "@/components/SimpleCrud";

interface TaxLite { id: string; name: string; ratePercent: number; type: string }
interface ProductRow {
  id: string; name: string; description: string | null;
  unitPriceCents: number; taxRateId: string | null;
  taxRate: TaxLite | null; active: boolean;
}

export default function ProductsPage() {
  const taxes = useApi<TaxLite[]>("/api/tax-rates");

  const taxOptions = [
    { value: "", label: "No default tax" },
    ...(taxes.data ?? []).map((t) => ({
      value: t.id,
      label: `${t.name} — ${t.ratePercent}%${t.type === "INCLUSIVE" ? " incl." : ""}`,
    })),
  ];

  const fields: CrudField[] = [
    { key: "name", label: "Name", kind: "text", required: true },
    { key: "unitPrice", label: "Unit price", kind: "number", required: true, placeholder: "0.00" },
    { key: "taxRateId", label: "Default tax rate", kind: "select", options: taxOptions },
    { key: "description", label: "Description", kind: "textarea", span: 2 },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: CrudColumn<any>[] = [
    { key: "name", header: "Product / Service", render: (r) => (
        <span className={`font-semibold ${r.active ? "text-slate-800" : "text-slate-400 line-through"}`}>{r.name}</span>
      ) },
    { key: "description", header: "Description", render: (r) => <span className="max-w-sm truncate text-slate-500">{r.description}</span> },
    {
      key: "price", header: "Price", align: "right",
      render: (r) => <span className="tabular-nums font-semibold">{formatMoney(r.unitPriceCents)}</span>,
    },
    {
      key: "taxRateId", header: "Tax",
      render: (r) => r.taxRate
        ? <span className="badge bg-blue-50 text-blue-700 ring-blue-300">{r.taxRate.ratePercent}%</span>
        : <span className="text-xs text-slate-400">—</span>,
    },
  ];

  if (taxes.loading) return null;

  return (
    <SimpleCrud<ProductRow>
      title="Products"
      subtitle="Reusable catalog items — prices are snapshots onto invoice lines when used"
      singular="Product"
      endpoint="/api/products"
      fields={fields}
      columns={columns}
    />
  );
}
