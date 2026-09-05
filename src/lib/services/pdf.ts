import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";

const GRAY = "#6b7280";
const LIGHT = "#f3f4f6";
const BORDER = "#e5e7eb";
const ACCENT = "#2563eb";

interface PdfItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRatePercent: number;
  taxType: string;
  lineTotalCents: number;
}

interface EntityLike {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  bankDetails: string | null;
  footerText: string | null;
}

function money(cents: number, currency: string) {
  return formatMoney(cents, currency, "en-US");
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

function taxLabel(it: PdfItem): string {
  if (!it.taxRatePercent) return "—";
  return it.taxType === "INCLUSIVE"
    ? `incl ${trimNum(it.taxRatePercent)}%`
    : `${trimNum(it.taxRatePercent)}%`;
}

function watermarkPage(doc: PDFKit.PDFDocument, status: string) {
  doc.save();
  doc.fontSize(64).fillColor("#00000010");
  doc.rotate(-35, { origin: [297, 400] }).text(status, 40, 380, {
    width: 520,
    align: "center",
    characterSpacing: 14,
  });
  doc.restore();
}

/**
 * Server-side print-ready PDF (doc §9): branded letterhead, itemized table,
 * tax breakdown, settlement history and DRAFT/VOID watermarking.
 */
export async function renderInvoicePdf(invoiceId: string): Promise<Buffer> {
  const raw = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, entity: true, items: true, payments: true, creditNotes: true },
  });
  if (!raw) throw new Error("Invoice not found");
  const inv = raw as unknown as FullDoc;

  const e = inv.entity as EntityLike;

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  if (inv.status === "DRAFT" || inv.status === "VOID") watermarkPage(doc, inv.status);

  /* ── letterhead ── */
  doc.rect(0, 0, 595.28, 6).fill(ACCENT);
  let y = 56;
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(17).text(e.name, 50, y);
  doc.font("Helvetica").fontSize(8.5).fillColor(GRAY);
  const head2 = [
    e.address,
    [e.email, e.phone].filter(Boolean).join("  ·  "),
    e.taxId ? `Tax ID: ${e.taxId}` : null,
  ].filter(Boolean) as string[];
  for (const line of head2) {
    y += 12;
    doc.text(line, 50, y);
  }

  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(24)
    .text("INVOICE", 350, 52, { width: 195, align: "right" });
  doc.font("Helvetica").fontSize(9.5).fillColor(GRAY)
    .text(inv.invoiceNumber, 350, 80, { width: 195, align: "right" });

  y = Math.max(y + 16, 104);
  doc.fontSize(9)
    .text(`Issued: ${fmtDate(new Date(inv.issueDate))}`, 350, y, { width: 195, align: "right" })
    .text(`Due: ${fmtDate(new Date(inv.dueDate))}`, 350, y + 13, { width: 195, align: "right" });
  if (inv.poNumber) doc.text(`PO: ${inv.poNumber}`, 350, y + 26, { width: 195, align: "right" });

  /* ── bill-to ── */
  y = 170;
  doc.rect(50, y, 495, 58).fillAndStroke(LIGHT, BORDER);
  doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(7.5).text("BILL TO", 62, y + 8);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(inv.client.name ?? "", 62, y + 21);
  doc.font("Helvetica").fontSize(8.5).fillColor(GRAY);
  const billLines = [
    ...((inv.client.billingAddress ?? "").split("\n").filter(Boolean)),
    inv.client.email ?? "",
  ].filter(Boolean);
  doc.text(billLines.join(" · "), 62, y + 36, { width: 330 });
  if (inv.client.taxId)
    doc.text(`Client Tax ID: ${inv.client.taxId}`, 320, y + 36, { width: 210, align: "right" });

  /* ── items table ── */
  y = 252;
  const C = { descX: 58, descW: 225, qtyR: 328, priceR: 398, taxR: 452, amtR: 537 };
  doc.rect(50, y - 16, 495, 22).fill("#eef2ff");
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(8);
  doc.text("DESCRIPTION", C.descX, y - 11);
  doc.text("QTY", C.qtyR - 40, y - 11, { width: 40, align: "right" });
  doc.text("UNIT PRICE", C.priceR - 70, y - 11, { width: 70, align: "right" });
  doc.text("TAX", C.taxR - 46, y - 11, { width: 46, align: "right" });
  doc.text("AMOUNT", C.amtR - 78, y - 11, { width: 78, align: "right" });
  y += 12;

  for (const it of inv.items) {
    doc.font("Helvetica").fontSize(9.5).fillColor("#111827");
    const descH = Math.max(doc.heightOfString(it.description, { width: C.descW }), 10);
    const rowH = descH + 10;
    if (y + rowH > 700) {
      doc.addPage();
      if (inv.status === "DRAFT" || inv.status === "VOID") watermarkPage(doc, inv.status);
      y = 70;
    }
    doc
      .text(it.description, C.descX, y + 4, { width: C.descW })
      .fontSize(8).fillColor(GRAY)
      .text(taxLabel(it), C.taxR - 46, y + 4, { width: 46, align: "right" })
      .fontSize(9.5).fillColor("#111827")
      .text(trimNum(it.quantity), C.qtyR - 40, y + 4, { width: 40, align: "right" })
      .text(money(it.unitPriceCents, inv.currency), C.priceR - 70, y + 4, { width: 70, align: "right" })
      .font("Helvetica-Bold")
      .text(money(it.lineTotalCents, inv.currency), C.amtR - 78, y + 4, { width: 78, align: "right" })
      .font("Helvetica");
    y += rowH;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  }

  /* ── totals ── */
  const line = (label: string, value: string, bold = false, delta = false) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 10.5 : 9)
      .fillColor(delta ? "#059669" : "#111827");
    doc.text(label, 330, y, { width: 110 });
    doc.text(value, 430, y, { width: 115, align: "right" });
    y += 15;
  };

  y += 14;
  if (y > 640) {
    doc.addPage();
    if (inv.status === "DRAFT" || inv.status === "VOID") watermarkPage(doc, inv.status);
    y = 70;
  }
  line("Subtotal", money(inv.subtotalCents, inv.currency));
  if (inv.discountTotalCents > 0)
    line("Discount", `− ${money(inv.discountTotalCents, inv.currency)}`, false, true);
  line("Total tax", money(inv.taxTotalCents, inv.currency));

  doc.rect(322, y - 3, 223, 24).fill(ACCENT);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11);
  doc.text("TOTAL DUE", 332, y + 3, { width: 110 });
  doc.text(money(inv.grandTotalCents, inv.currency), 432, y + 3, { width: 103, align: "right" });
  y += 36;

  /* ── settlement history ── */
  if (inv.payments.length || inv.creditNotes.length) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GRAY).text("SETTLEMENT HISTORY", 322, y);
    y += 15;
    for (const p of [...inv.payments].sort((a, b) => +a.paidAt - +b.paidAt)) {
      line(
        `${fmtDate(new Date(p.paidAt))} · ${p.method.replace("_", " ")}`,
        money(p.amountCents, p.currency),
        false,
        true
      );
    }
    for (const cn of inv.creditNotes) {
      line(`${cn.creditNumber} · credit`, `− ${money(cn.amountCents, inv.currency)}`, false, true);
    }
    const bal = Math.max(0, inv.grandTotalCents - inv.amountPaidCents - inv.creditedCents);
    line("Balance due", money(bal, inv.currency), true);
    y += 4;
  }

  /* ── notes / terms / bank / footer ── */
  doc.x = 50;
  doc.y = Math.max(y + 20, 726);
  doc.fontSize(8).fillColor(GRAY);
  if (inv.notes) {
    doc.font("Helvetica-Bold").text("NOTES", 50, doc.y);
    doc.font("Helvetica").text(inv.notes, 50, doc.y + 1, { width: 482 });
    doc.moveDown(0.4);
  }
  if (inv.terms) {
    doc.font("Helvetica-Bold").text("TERMS", 50, doc.y);
    doc.font("Helvetica").text(inv.terms, 50, doc.y + 1, { width: 482 });
  }
  if (e.bankDetails) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").text("PAYMENT DETAILS", 50, doc.y);
    doc.font("Helvetica").text(e.bankDetails, 50, doc.y + 1, { width: 482 });
  }
  doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
    .text(e.footerText ?? "Thank you for your business.", 50, 800, {
      width: 495,
      align: "center",
    });

  doc.end();
  return done;
}

interface FullDoc {
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  subtotalCents: number;
  discountTotalCents: number;
  taxTotalCents: number;
  grandTotalCents: number;
  amountPaidCents: number;
  creditedCents: number;
  notes: string | null;
  terms: string | null;
  poNumber: string | null;
  entity: EntityLike;
  client: {
    name: string | null;
    email: string | null;
    billingAddress: string | null;
    taxId: string | null;
  };
  items: PdfItem[];
  payments: Array<{ paidAt: Date; method: string; amountCents: number; currency: string }>;
  creditNotes: Array<{ creditNumber: string; amountCents: number }>;
}
