import { prisma } from "../src/lib/prisma";
import { dispatchDueReminders } from "../src/lib/services/reminders";

async function runBenchmark() {
  console.log("Setting up benchmark data...");

  let entity = await prisma.entity.findFirst();
  if (!entity) {
    entity = await prisma.entity.create({
      data: { name: "Bench Entity", legalName: "Bench Entity LLC" },
    });
  }
  let client = await prisma.client.findFirst();
  if (!client) {
    client = await prisma.client.create({
      data: { name: "Bench Client", entityId: entity.id },
    });
  }

  // Create an open invoice (status: SENT)
  const openInvoice = await prisma.invoice.create({
    data: {
      entityId: entity.id,
      clientId: client.id,
      invoiceNumber: `INV-OPEN-${Date.now()}`,
      sequence: 8888,
      status: "SENT",
      issueDate: new Date(),
      dueDate: new Date(),
      currency: "USD",
      exchangeRate: 1.0,
      subtotalCents: 1000,
      taxTotalCents: 0,
      grandTotalCents: 1000,
    },
  });

  // Create a cancelled/paid invoice (status: PAID)
  const cancelledInvoice = await prisma.invoice.create({
    data: {
      entityId: entity.id,
      clientId: client.id,
      invoiceNumber: `INV-PAID-${Date.now()}`,
      sequence: 9999,
      status: "PAID",
      issueDate: new Date(),
      dueDate: new Date(),
      currency: "USD",
      exchangeRate: 1.0,
      subtotalCents: 1000,
      taxTotalCents: 0,
      grandTotalCents: 1000,
    },
  });

  // Clean existing reminders & audit logs for benchmark isolated run
  await prisma.reminder.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { entityType: "REMINDER" } });

  // Create 150 open reminders and 50 cancelled reminders
  const remindersData = [];
  const pastDate = new Date(Date.now() - 3600000);

  for (let i = 0; i < 150; i++) {
    remindersData.push({
      invoiceId: openInvoice.id,
      type: "BEFORE_DUE_3",
      channel: "EMAIL",
      subject: `Bench reminder ${i}`,
      body: `Body ${i}`,
      scheduledAt: pastDate,
      status: "PENDING",
    });
  }

  for (let i = 0; i < 50; i++) {
    remindersData.push({
      invoiceId: cancelledInvoice.id,
      type: "OVERDUE_7",
      channel: "EMAIL",
      subject: `Paid Bench reminder ${i}`,
      body: `Body ${i}`,
      scheduledAt: pastDate,
      status: "PENDING",
    });
  }

  await prisma.reminder.createMany({ data: remindersData });

  console.log("Starting benchmark execution...");
  const start = performance.now();
  const sentCount = await dispatchDueReminders(new Date());
  const elapsed = performance.now() - start;

  console.log(`Dispatched ${sentCount} reminders in ${elapsed.toFixed(2)} ms.`);

  // Verification
  const sentInDb = await prisma.reminder.count({ where: { status: "SENT" } });
  const cancelledInDb = await prisma.reminder.count({ where: { status: "CANCELLED" } });
  const auditLogsInDb = await prisma.auditLog.count({ where: { entityType: "REMINDER", action: "DISPATCH" } });

  console.log(`Verification: SENT=${sentInDb} (expected 150), CANCELLED=${cancelledInDb} (expected 50), AUDIT_LOGS=${auditLogsInDb} (expected 150)`);

  if (sentInDb !== 150 || cancelledInDb !== 50 || auditLogsInDb !== 150) {
    console.error("VERIFICATION FAILED!");
    process.exit(1);
  } else {
    console.log("VERIFICATION PASSED!");
  }
}

runBenchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});
