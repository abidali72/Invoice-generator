"use client";

import { use, useState } from "react";
import { useApi } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner } from "@/components/ui";
import { InvoiceForm } from "@/components/InvoiceForm";
import type { ClientOpt, FormLine } from "@/components/InvoiceForm";

interface InvDetail {
  id: string; status: string; clientId: string; issueDate: string; dueDate: string;
  poNumber: string | null; notes: string | null; terms: string | null;
  discountType: "PERCENT" | "FIXED" | null; discountValue: number | null;
  items: Array<{
    productId: string | null; description: string; quantity: number;
    unitPriceCents: number; taxRateId: string | null;
  }>;
}

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const inv = useApi<InvDetail>(`/api/invoices/${id}`);
  const [warned] = useState(false);

  const clients = useApi<ClientOpt[]>("/api/clients");
  const products = useApi<Parameters<typeof InvoiceForm>[0]["products"]>("/api/products");
  const taxRates = useApi<Parameters<typeof InvoiceForm>[0]["taxRates"]>("/api/tax-rates");

  if (inv.loading || clients.loading) return <Spinner />;
  if (inv.error) return <ErrorBanner message={inv.error} />;
  if (!inv.data) return null;

  const d = inv.data;
  if (d.status !== "DRAFT") {
    return (
      <ErrorBanner
        message={`Only DRAFT invoices are editable — ${d.status} invoices must be corrected via credit note (doc §19).`}
      />
    );
  }

  return (
    <>
      <PageHeader title="Edit draft" subtitle="Changes replace all line items and recalculate totals" />
      {!warned && null}
      <InvoiceForm
        invoiceId={id}
        initial={{
          clientId: d.clientId,
          issueDate: d.issueDate.slice(0, 10),
          dueDate: d.dueDate.slice(0, 10),
          lines: d.items.map((it): FormLine => ({
            productId: it.productId ?? "",
            description: it.description,
            quantity: String(it.quantity),
            unitPrice: (it.unitPriceCents / 100).toFixed(2),
            taxRateId: it.taxRateId ?? "",
          })),
          discountType: d.discountType ?? "",
          discountValue: d.discountValue != null ? String(d.discountValue) : "",
          notes: d.notes ?? "",
          terms: d.terms ?? "",
          poNumber: d.poNumber ?? "",
        }}
        clients={(clients.data ?? []) as ClientOpt[]}
        products={products.data ?? []}
        taxRates={taxRates.data ?? []}
      />
    </>
  );
}
