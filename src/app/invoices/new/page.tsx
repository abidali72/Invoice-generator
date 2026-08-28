"use client";

import { useApi } from "@/lib/hooks";
import { PageHeader, Spinner, ErrorBanner } from "@/components/ui";
import { InvoiceForm } from "@/components/InvoiceForm";
import type { ClientOpt, ProductOpt, TaxOpt } from "@/components/InvoiceForm";

export default function NewInvoicePage() {
  const [clients, products, taxRates] = [
    useApi<ClientOpt[]>("/api/clients"),
    useApi<ProductOpt[]>("/api/products"),
    useApi<TaxOpt[]>("/api/tax-rates"),
  ];
  const loading = clients.loading || products.loading || taxRates.loading;
  const error = clients.error ?? products.error ?? taxRates.error;

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <>
      <PageHeader
        title="New invoice"
        subtitle="Sequential number is allocated automatically on save"
      />
      <InvoiceForm
        clients={(clients.data ?? []) as ClientOpt[]}
        products={(products.data ?? []).filter((p) => p.active !== false)}
        taxRates={(taxRates.data ?? []) as TaxOpt[]}
      />
    </>
  );
}
