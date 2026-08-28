/* Invoice Generator — demo data seeder (plain Node/CJS).
 * Creates the Acme Studio entity, FX table, tax rates, clients, products and
 * a realistic invoice dataset spanning every lifecycle state (doc §7).
 * Run: npm run db:seed   (after: npm run db:push)
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DAY = 86400000;
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * DAY);
const daysAhead = (n) => new Date(now.getTime() + n * DAY);

// ── money math mirrors src/lib/money.ts exactly ──
function allocate(total, weights) {
  const wSum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || wSum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / wSum);
  const floors = raw.map(Math.floor);
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = floors.slice();
  let c = 0;
  while (rem > 0) { out[order[c % order.length].i] += 1; rem--; c++; }
  return out;
}
function computeInvoice(inputs, discount) {
  const gross = inputs.map((it) => Math.round(it.quantity * it.unitPriceCents));
  const subtotal = gross.reduce((a, b) => a + b, 0);
  let disc = 0;
  if (discount && discount.type === "PERCENT") disc = Math.round((subtotal * discount.value) / 100);
  else if (discount && discount.type === "FIXED") disc = Math.round(discount.value ?? 0);
  disc = Math.min(disc, subtotal);
  const shares = allocate(disc, gross);
  const items = inputs.map((it, i) => {
    const net = gross[i] - shares[i];
    const r = it.taxRatePercent || 0;
    const tax = r > 0
      ? (it.taxType === "INCLUSIVE" ? Math.round((net * r) / (100 + r)) : Math.round((net * r) / 100))
      : 0;
    return { grossCents: gross[i], discountShareCents: shares[i], netCents: net, taxCents: tax,
      lineTotalCents: it.taxType === "INCLUSIVE" ? net : net + tax };
  });
  return {
    items,
    subtotalCents: subtotal,
    discountTotalCents: disc,
    taxTotalCents: items.reduce((a, b) => a + b.taxCents, 0),
    grandTotalCents: items.reduce((a, b) => a + b.lineTotalCents, 0),
  };
}

const AUDIT_ACTOR = "admin@acme.studio";
async function logIt(entityType, entityId, action, summary, ts) {
  await prisma.auditLog.create({
    data: { entityType, entityId, actor: AUDIT_ACTOR, action, summary,
      ...(ts ? { timestamp: ts } : {}) },
  });
}

async function main() {
  console.log("Seeding…");
  await prisma.auditLog.deleteMany({});
  for (const m of ["reminder", "creditNote", "payment", "invoiceItem", "invoice",
    "recurringProfile", "product", "taxRate", "client"]) {
    if (prisma[m]) await prisma[m].deleteMany();
  }
  await prisma.entity.deleteMany({});
  await prisma.currencyRate.deleteMany({});

  /* ── FX table (§12) ── */
  const fx = [
    ["USD", "$", "US Dollar", 1], ["EUR", "€", "Euro", 1.08], ["GBP", "£", "British Pound", 1.27],
    ["AED", "د.إ", "UAE Dirham", 0.2723], ["PKR", "₨", "Pakistani Rupee", 0.0036],
    ["CAD", "C$", "Canadian Dollar", 0.73], ["AUD", "A$", "Australian Dollar", 0.66],
    ["INR", "₹", "Indian Rupee", 0.012],
  ];
  for (const [code, symbol, name, rateToBase] of fx)
    await prisma.currencyRate.create({ data: { code, symbol, name, rateToBase } });

  /* ── company entity ── */
  const entity = await prisma.entity.create({
    data: {
      name: "Acme Studio LLC",
      legalName: "Acme Studio Limited Liability Company",
      taxId: "TAX-88213-US",
      address: "247 Creative Lane\nBrooklyn, NY 11211\nUnited States",
      email: "billing@acme.studio",
      phone: "+1 (718) 555-0142",
      website: "https://acme.studio",
      defaultCurrency: "USD",
      bankDetails: "Acme Studio LLC · First Brooklyn Bank\nRouting 021000021 · Account 000123456789\nSWIFT: FBKNUS33 · Reference: invoice number",
      invoicePrefix: "INV-{YEAR}-{SEQ}",
      seqPad: 4,
      footerText: "Thank you for your business. · Acme Studio LLC · acme.studio",
      defaultTerms: "Payment due within 30 days of issue. Late payments accrue 1.5% monthly interest.",
      defaultNotes: "Thank you for your business.",
    },
  });

  /* ── tax rates (§11) ── */
  const mkTax = (name, ratePercent, region, type) =>
    prisma.taxRate.create({ data: { entityId: entity.id, name, ratePercent, region, type } });
  const tSales = await mkTax("Sales Tax NY", 8, "US-NY", "EXCLUSIVE");
  const tVatUK = await mkTax("VAT Standard UK", 20, "GB", "EXCLUSIVE");
  const tZero = await mkTax("Zero-rated Export", 0, "INTL", "EXCLUSIVE");

  /* ── clients ── */
  const mkClient = (d) => prisma.client.create({ data: { ...d, entityId: entity.id } });
  const cGlobal = await mkClient({
    name: "Global Retail Co.", email: "billing@globalretail.com", phone: "+1 212 555 0100",
    billingAddress: "500 Commerce Way\nNew York, NY 10018\nUnited States",
    shippingAddress: "Warehouse Dock B\nNewark, NJ 07102\nUnited States",
    taxId: "EIN-98-7654321", currency: "USD",
  });
  const cNordic = await mkClient({
    name: "Nordic Design AB", email: "faktura@nordicdesign.se",
    billingAddress: "Hornsgatan 12\n118 20 Stockholm\nSweden",
    taxId: "SE556789012301", currency: "EUR",
  });
  const cBrite = await mkClient({
    name: "Britestyle Ltd", email: "accounts@britestyle.co.uk",
    billingAddress: "18 Kensington Mews\nLondon W8 5BN\nUnited Kingdom",
    taxId: "GB432198765", currency: "GBP",
  });
  const cEmir = await mkClient({
    name: "Emirates Trading LLC", email: "pay@emiratetrading.ae",
    billingAddress: "Office 1102, DIFC Gate Ave\nDubai\nUnited Arab Emirates",
    taxId: "AE100234567800003", currency: "AED",
  });

  /* ── products ── */
  const pMaint = await prisma.product.create({ data: { entityId: entity.id,
    name: "Monthly Retainer", description: "Support & iteration block", unitPriceCents: 180000, taxRateId: tZero.id } });
  const pAudit = await prisma.product.create({ data: { entityId: entity.id,
    name: "UX Audit", description: "Heuristic review + report", unitPriceCents: 95000, taxRateId: tZero.id } });

  /* helper to persist an invoice with lines */
  let seq = 0;
  async function makeInvoice(o) {
    seq += 1;
    const year = o.issueDate.getFullYear();
    const number = `INV-${year}-${String(seq).padStart(4, "0")}`;
    const calc = computeInvoice(
      o.items.map((it) => ({ quantity: it.quantity, unitPriceCents: it.unitPriceCents,
        taxRatePercent: it.tax ? it.tax.ratePercent : 0,
        taxType: it.tax ? it.tax.type : "EXCLUSIVE" })),
      o.discount ?? null
    );
    return prisma.invoice.create({
      data: {
        entityId: entity.id, clientId: o.client.id, invoiceNumber: number, sequence: seq,
        status: o.status, issueDate: o.issueDate, dueDate: o.dueDate,
        currency: o.currency, exchangeRate: fx.find(([c]) => c === o.currency)[3],
        discountType: o.discount ? o.discount.type : null,
        discountValue: o.discount ? o.discount.value : null,
        subtotalCents: calc.subtotalCents, discountTotalCents: calc.discountTotalCents,
        taxTotalCents: calc.taxTotalCents, grandTotalCents: calc.grandTotalCents,
        amountPaidCents: o.paidCents ?? 0, creditedCents: o.creditedCents ?? 0,
        notes: "Thank you for your business.", terms: entity.defaultTerms, poNumber: o.poNumber ?? null,
        sentAt: ["SENT","VIEWED","PARTIALLY_PAID","PAID","OVERDUE"].includes(o.status) ? o.issueDate : null,
        viewedAt: ["VIEWED","PARTIALLY_PAID","OVERDUE"].includes(o.status) ? o.issueDate : null,
        voidedAt: o.status === "VOID" ? daysAgo(30) : null,
        items: {
          create: o.items.map((it, i) => ({
            productId: it.productId ?? null, description: it.description,
            quantity: it.quantity, unitPriceCents: it.unitPriceCents,
            taxRateId: it.tax ? it.tax.id : null,
            taxRateName: it.tax ? `${it.tax.name} (${it.tax.ratePercent}%)` : null,
            taxRatePercent: it.tax ? it.tax.ratePercent : 0,
            taxType: it.tax ? it.tax.type : "EXCLUSIVE",
            discountShareCents: calc.items[i].discountShareCents, netCents: calc.items[i].netCents,
            taxCents: calc.items[i].taxCents, lineTotalCents: calc.items[i].lineTotalCents,
          })),
        },
      },
    });
  }

  /* ── invoices across §7 lifecycle ── */
  const inv1 = await makeInvoice({
    client: cGlobal, currency: "USD", status: "PAID",
    issueDate: daysAgo(200), dueDate: daysAgo(170), poNumber: "PO-GRC-2026-114",
    items: [
      { description: "Brand Identity Design", quantity: 1, unitPriceCents: 250000, tax: tSales },
      { description: "Website Development (3 pages)", quantity: 3, unitPriceCents: 133300, tax: tSales },
    ],
  });
  await prisma.payment.create({ data: { invoiceId: inv1.id, amountCents: inv1.grandTotalCents,
    currency: "USD", method: "BANK_TRANSFER", paidAt: daysAgo(172), note: "Wire ref WIRE-88213" } });
  await logIt("INVOICE", inv1.id, "PAYMENT_RECORDED",
    `${(inv1.grandTotalCents / 100).toFixed(2)} USD received on ${inv1.invoiceNumber}`, daysAgo(172));

  const inv2 = await makeInvoice({
    client: cNordic, currency: "EUR", status: "PAID",
    issueDate: daysAgo(140), dueDate: daysAgo(110),
    items: [{ description: "Monthly Retainer", quantity: 1, unitPriceCents: 180000, tax: tZero }],
  });
  await prisma.payment.create({ data: { invoiceId: inv2.id, amountCents: inv2.grandTotalCents,
    currency: "EUR", method: "ONLINE", gatewayReference: "STRIPE_ch_3PqX92K", paidAt: daysAgo(115) } });

  const inv3 = await makeInvoice({
    client: cGlobal, currency: "USD", status: "PARTIALLY_PAID",
    issueDate: daysAgo(40), dueDate: daysAhead(20),
    items: [
      { description: "Motion Graphics — campaign set", quantity: 4, unitPriceCents: 120000, tax: tSales },
      { description: "Print Collateral", quantity: 2, unitPriceCents: 45000, tax: tSales },
    ],
  });
  await prisma.payment.create({ data: { invoiceId: inv3.id,
    amountCents: Math.round(inv3.grandTotalCents * 0.4), currency: "USD",
    method: "CHEQUE", paidAt: daysAgo(18), note: "Cheque #2231" } });

  const inv4 = await makeInvoice({
    client: cBrite, currency: "GBP", status: "OVERDUE",
    issueDate: daysAgo(75), dueDate: daysAgo(45),
    items: [
      { description: "UX Audit", quantity: 2, unitPriceCents: 95000, tax: tVatUK },
      { description: "Consulting Hours (senior)", quantity: 10, unitPriceCents: 15000, tax: tVatUK },
    ],
  });
  await prisma.reminder.createMany({ data: [
    { invoiceId: inv4.id, type: "OVERDUE_7", channel: "EMAIL",
      subject: `Action required: invoice ${inv4.invoiceNumber} is overdue`,
      body: `Our records show invoice ${inv4.invoiceNumber} became overdue recently. Kindly settle the outstanding balance.`,
      scheduledAt: daysAgo(38) },
    { invoiceId: inv4.id, type: "OVERDUE_14", channel: "EMAIL",
      subject: `Second notice: overdue invoice ${inv4.invoiceNumber}`,
      body: `This is a second formal notice regarding ${inv4.invoiceNumber}.`,
      scheduledAt: daysAgo(31) },
  ]});

  const inv5 = await makeInvoice({
    client: cEmir, currency: "AED", status: "VIEWED",
    issueDate: daysAgo(5), dueDate: daysAhead(25),
    items: [{ description: "SEO Package (quarterly)", quantity: 3, unitPriceCents: 75000, tax: tZero }],
  });

  const inv6 = await makeInvoice({
    client: cNordic, currency: "EUR", status: "SENT",
    issueDate: daysAgo(2), dueDate: daysAhead(28),
    items: [{ description: "Monthly Retainer — current period", quantity: 1, unitPriceCents: 180000, tax: tZero }],
  });
  await prisma.reminder.createMany({ data: [
    { invoiceId: inv6.id, type: "BEFORE_DUE_3", subject: `Friendly reminder: invoice ${inv6.invoiceNumber} due soon`,
      body: `Gentle nudge that ${inv6.invoiceNumber} is due on ${inv6.dueDate.toDateString()}.`, scheduledAt: daysAhead(25) },
    { invoiceId: inv6.id, type: "ON_DUE", subject: `Invoice ${inv6.invoiceNumber} is due today`,
      body: `${inv6.invoiceNumber} is due today.`, scheduledAt: daysAhead(28) },
  ]});

  await makeInvoice({
    client: cGlobal, currency: "USD", status: "DRAFT",
    issueDate: now, dueDate: daysAhead(30), poNumber: "PO-GRC-2026-207",
    items: [
      { description: "Q4 Campaign concept development", quantity: 1, unitPriceCents: 420000 },
      { description: "Consulting Hours (senior)", quantity: 6, unitPriceCents: 15000 },
    ],
    discount: { type: "PERCENT", value: 5 },
  });

  await makeInvoice({
    client: cBrite, currency: "GBP", status: "VOID",
    issueDate: daysAgo(90), dueDate: daysAgo(60),
    items: [{ description: "Old proposal — superseded", quantity: 1, unitPriceCents: 99900 }],
  });

  /* partially credited then fully settled (§3.7 flow) */
  const inv9calc = computeInvoice(
    [{ quantity: 1, unitPriceCents: 360000, taxRatePercent: 8, taxType: "EXCLUSIVE" }], null);
  const creditAmount = Math.round(inv9calc.grandTotalCents * 0.25);
  const inv9 = await makeInvoice({
    client: cGlobal, currency: "USD", status: "PAID",
    issueDate: daysAgo(60), dueDate: daysAgo(30),
    items: [{ description: "Event booth design & production", quantity: 1, unitPriceCents: 360000, tax: tSales }],
    creditedCents: creditAmount,
    paidCents: inv9calc.grandTotalCents - creditAmount,
  });
  await prisma.creditNote.create({ data: { invoiceId: inv9.id, creditNumber: "CR-2026-0001",
    amountCents: creditAmount, reason: "Goodwill discount on signage overage", issuedAt: daysAgo(33) } });
  await prisma.payment.create({ data: { invoiceId: inv9.id,
    amountCents: inv9calc.grandTotalCents - creditAmount, currency: "USD",
    method: "CARD", gatewayReference: "SQ_9kLmNoPq", paidAt: daysAgo(31) } });
  await logIt("CREDIT_NOTE", inv9.id, "CREATE",
    `CR-2026-0001 for ${(creditAmount / 100).toFixed(2)} USD against ${inv9.invoiceNumber}`, daysAgo(33));

  /* ── recurring profiles (§3.1) ── */
  await prisma.recurringProfile.create({ data: {
    entityId: entity.id, clientId: cNordic.id, title: "Design retainer — Nordic Design AB",
    basisInvoiceId: inv2.id, frequency: "MONTHLY", nextRunDate: daysAhead(1),
    autoSend: true, cyclesRun: 11, currency: "EUR",
    itemsJson: JSON.stringify([
      { productId: pMaint.id, description: "Monthly Retainer — ongoing support",
        quantity: 1, unitPriceCents: 180000, taxRateId: null },
    ]) } });

  await prisma.recurringProfile.create({ data: {
    entityId: entity.id, clientId: cGlobal.id, title: "Fortnightly UX audits — Global Retail",
    basisInvoiceId: null, frequency: "CUSTOM_DAYS", intervalDays: 14, nextRunDate: daysAhead(4),
    autoSend: false, cyclesRun: 3, endCycles: 6, currency: "USD",
    itemsJson: JSON.stringify([
      { productId: pAudit.id, description: "UX Audit sprint", quantity: 2, unitPriceCents: 95000, taxRateId: null },
    ]) } });

  /* representative audit timeline */
  await logIt("SETTINGS", entity.id, "UPDATE", "Company profile configured", daysAgo(210));
  for (const inv of [inv1, inv2, inv4, inv6])
    await logIt("INVOICE", inv.id, "SEND", `${inv.invoiceNumber} e-mailed to client`, inv.sentAt ?? inv.createdAt);

  console.log(`Seed complete: Acme Studio entity, ${seq} invoices across all lifecycle states, 2 recurring profiles, 8 currencies.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
