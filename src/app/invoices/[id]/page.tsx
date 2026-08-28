"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { StatusPill } from "@/components/ui";
import { PageHeader } from "@/components/ui";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  client: { id: string; name: string };
  issueDate: string;
  dueDate: string;
  currency: string;
  grandTotalCents: number;
  amountPaidCents: number;
  creditedCents: number;
}

export default function InvoiceDetailPage() {
  const [id, setId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInvoice = async (invoiceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<InvoiceRow>(`/api/invoices/${invoiceId}`);
      setInvoice(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!id) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Invoice ID required</h1>
        <p className="text-slate-600">Please provide an invoice ID.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6">Loading invoice...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Error</h1>
        <p className="text-slate-600">{error}</p>
      </div>
    );
  }

  const balance = invoice!.grandTotalCents - invoice!.amountPaidCents - invoice!.creditedCents;

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={`Invoice ${invoice!.invoiceNumber}`}
        subtitle={`Client: ${invoice!.client.name}`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-lg font-medium mb-3">Invoice Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Invoice Number</dt>
              <dd className="font-medium">{invoice!.invoiceNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <StatusPill status={invoice!.status} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Issue Date</dt>
              <dd>{invoice!.issueDate}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Due Date</dt>
              <dd>{invoice!.dueDate}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Currency</dt>
              <dd>{invoice!.currency}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Amount Paid</dt>
              <dd>{formatMoney(invoice!.amountPaidCents, invoice!.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Credited</dt>
              <dd>{formatMoney(invoice!.creditedCents, invoice!.currency)}</dd>
            </div>
            <div className="flex justify-between font-bold text-xl">
              <dt className="text-slate-500">Balance Due</dt>
              <dd>{formatMoney(balance, invoice!.currency)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-3">Actions</h3>
          <div className="space-y-3">
            {invoice!.status === "DRAFT" && (
              <button onClick={() => window.location.href = `/invoices/new?copy=${invoice!.id}`}
                className="btn-primary w-full">
                Duplicate Invoice
              </button>
            )}
            {["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice!.status) && (
              <>
                <a href={`/api/invoices/${invoice!.id}/pdf`} target="_blank" rel="noreferrer"
                  className="btn-secondary w-full">
                  <i className="Download size={14} mr-2" /> Download PDF
                </a>
                <button onClick={() => window.location.href = `/invoices/${invoice!.id}/send`}
                  className="btn-secondary w-full">
                  <i className="Send size={14} mr-2" /> Mark as Sent
                </button>
                <button onClick={() => window.location.href = `/invoices/${invoice!.id}/pay`}
                  className="btn-secondary w-full">
                  <i className="BankTransfer size={14} mr-2" /> Record Payment
                </button>
              </>
            )}
            {invoice!.status !== "VOID" && invoice!.status !== "DRAFT" && (
              <button onClick={() => window.location.href = `/invoices/${invoice!.id}/void`}
                className="btn-danger w-full">
                Void Invoice
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}