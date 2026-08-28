// Domain enumerations — SQLite has no Prisma enums (see schema comment),
// so discriminators are plain strings constrained by these unions/maps.

export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "VOID";

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
];

export type PaymentMethod = "CASH" | "CHEQUE" | "BANK_TRANSFER" | "CARD" | "ONLINE";
export const PAYMENT_METHODS: PaymentMethod[] = [
  "CASH",
  "CHEQUE",
  "BANK_TRANSFER",
  "CARD",
  "ONLINE",
];

export type RecurringFrequency =
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "ANNUALLY"
  | "CUSTOM_DAYS";
export const RECURRING_FREQUENCIES: RecurringFrequency[] = [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUALLY",
  "CUSTOM_DAYS",
];

export type ReminderType =
  | "BEFORE_DUE_3"
  | "ON_DUE"
  | "OVERDUE_7"
  | "OVERDUE_14"
  | "OVERDUE_30"
  | "AD_HOC";

export type ReminderChannel = "EMAIL" | "SMS";

export type TaxTypeT = "INCLUSIVE" | "EXCLUSIVE";

// convenience re-exports so consumers can pull all domain scalars from one place
export type { DiscountType, TaxType } from "@/lib/money";

export const STATUS_STYLES: Record<InvoiceStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-700 ring-slate-300" },
  SENT: { label: "Sent", cls: "bg-blue-50 text-blue-700 ring-blue-300" },
  VIEWED: { label: "Viewed", cls: "bg-indigo-50 text-indigo-700 ring-indigo-300" },
  PARTIALLY_PAID: { label: "Partially Paid", cls: "bg-amber-50 text-amber-700 ring-amber-300" },
  PAID: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-300" },
  OVERDUE: { label: "Overdue", cls: "bg-red-50 text-red-700 ring-red-300" },
  VOID: { label: "Void", cls: "bg-zinc-200 text-zinc-600 ring-zinc-400" },
};

/** Supported currencies with fallback symbols (DB rows override). */
export const CURRENCY_CATALOG: Record<string, { symbol: string; name: string }> = {
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  AED: { symbol: "د.إ", name: "UAE Dirham" },
  PKR: { symbol: "₨", name: "Pakistani Rupee" },
  SAR: { symbol: "﷼", name: "Saudi Riyal" },
  CAD: { symbol: "C$", name: "Canadian Dollar" },
  AUD: { symbol: "A$", name: "Australian Dollar" },
  INR: { symbol: "₹", name: "Indian Rupee" },
};

export function currencySymbol(code: string): string {
  return CURRENCY_CATALOG[code]?.symbol ?? code;
}
