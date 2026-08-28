import { performance } from "perf_hooks";
import { prisma } from "../src/lib/prisma";
import { runDueProfiles } from "../src/lib/services/recurring";

async function setupBenchmarkData(numProfiles: number, runsPerProfile: number) {
  // Ensure entity & client exists
  const entity = await prisma.entity.findFirst() || await prisma.entity.create({
    data: { name: "Bench Entity", defaultCurrency: "USD" }
  });
  const client = await prisma.client.findFirst({ where: { entityId: entity.id } }) || await prisma.client.create({
    data: { entityId: entity.id, name: "Bench Client", currency: "USD" }
  });

  const now = new Date();
  // We set nextRunDate back in time so each profile generates runsPerProfile cycles (capped at 24 by guard)
  // For daily frequency, set nextRunDate to (runsPerProfile + 1) days ago.
  const pastDate = new Date(now.getTime() - (runsPerProfile + 1) * 86400000);

  const profileIds: string[] = [];
  for (let i = 0; i < numProfiles; i++) {
    const p = await prisma.recurringProfile.create({
      data: {
        entityId: entity.id,
        clientId: client.id,
        title: `Bench Profile ${i}_${Date.now()}`,
        frequency: "CUSTOM_DAYS",
        intervalDays: 1,
        nextRunDate: pastDate,
        autoSend: false,
        itemsJson: JSON.stringify([
          { description: "Bench Item 1", quantity: 1, unitPriceCents: 1000 }
        ]),
        currency: "USD",
        active: true,
      }
    });
    profileIds.push(p.id);
  }
  return profileIds;
}

async function cleanupBenchmarkData() {
  await prisma.auditLog.deleteMany({ where: { summary: { contains: "Bench Profile" } } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { notes: { contains: "Bench Profile" } } } });
  await prisma.invoice.deleteMany({ where: { notes: { contains: "Bench Profile" } } });
  await prisma.recurringProfile.deleteMany({ where: { title: { contains: "Bench Profile" } } });
}

async function runBenchmark() {
  const numProfiles = 20;
  const runsPerProfile = 10;

  console.log(`Setting up ${numProfiles} benchmark profiles with up to ${runsPerProfile} catch-up cycles each...`);
  await cleanupBenchmarkData();
  await setupBenchmarkData(numProfiles, runsPerProfile);

  const now = new Date();
  const start = performance.now();
  const results = await runDueProfiles(now);
  const duration = performance.now() - start;

  const totalGenerated = results.reduce((acc, r) => acc + r.generated, 0);
  console.log(`Benchmark finished in ${duration.toFixed(2)} ms.`);
  console.log(`Total profiles processed: ${results.length}, Total invoices generated: ${totalGenerated}`);

  await cleanupBenchmarkData();
}

runBenchmark()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
