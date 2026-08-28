"use client";

import { SimpleCrud } from "@/components/SimpleCrud";
import type { CrudColumn, CrudField } from "@/components/SimpleCrud";
import { CURRENCY_CATALOG } from "@/lib/types";

interface ClientRow {
  id: string; name: string; email: string | null; phone: string | null;
  billingAddress: string | null; shippingAddress: string | null;
  taxId: string | null; currency: string; notes: string | null;
}

const fields: CrudField[] = [
  { key: "name", label: "Name", kind: "text", required: true },
  { key: "email", label: "Email", kind: "email" },
  { key: "phone", label: "Phone", kind: "text" },
  { key: "taxId", label: "Tax ID / VAT / EIN", kind: "text" },
  {
    key: "currency", label: "Default currency", kind: "select",
    options: Object.keys(CURRENCY_CATALOG).map((c) => ({ value: c, label: `${c} — ${CURRENCY_CATALOG[c].name}` })),
  },
  { key: "billingAddress", label: "Billing address", kind: "textarea", span: 2 },
  { key: "shippingAddress", label: "Shipping address", kind: "textarea", span: 2 },
];

const columns: CrudColumn<ClientRow>[] = [
  { key: "name", header: "Name", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
  { key: "email", header: "Email", render: (r) => <span className="text-slate-600">{r.email}</span> },
  { key: "taxId", header: "Tax ID", render: (r) => <span className="text-xs text-slate-500">{r.taxId}</span> },
  {
    key: "currency", header: "Currency",
    render: (r) => <span className="badge bg-slate-100 text-slate-700 ring-slate-300">{r.currency}</span>,
  },
];

export default function ClientsPage() {
  return (
    <SimpleCrud<ClientRow>
      title="Clients"
      subtitle="Customer profiles with billing & tax details and default billing currency"
      singular="Client"
      endpoint="/api/clients"
      fields={fields}
      columns={columns}
    />
  );
}
