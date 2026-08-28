import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { runDueProfiles } from "../src/lib/services/recurring";

test("recurring profile test suite", async (t) => {
  // Ensure base entity & client exist
  let entity = await prisma.entity.findFirst();
  if (!entity) {
    entity = await prisma.entity.create({
      data: { name: "Test Entity", defaultCurrency: "USD" },
    });
  }
  let client = await prisma.client.findFirst({ where: { entityId: entity.id } });
  if (!client) {
    client = await prisma.client.create({
      data: { entityId: entity.id, name: "Test Client", currency: "USD" },
    });
  }

  await t.test("single due cycle updates profile once correctly", async () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 2 * 86400000); // 2 days ago
    const profile = await prisma.recurringProfile.create({
      data: {
        entityId: entity.id,
        clientId: client.id,
        title: "Single Run Test",
        frequency: "MONTHLY",
        nextRunDate: pastDate,
        autoSend: false,
        itemsJson: JSON.stringify([{ description: "Item 1", quantity: 1, unitPriceCents: 5000 }]),
        currency: "USD",
        active: true,
      },
    });

    const results = await runDueProfiles(now);
    const result = results.find((r) => r.profile === "Single Run Test");
    assert.ok(result);
    assert.equal(result.generated, 1);

    const updated = await prisma.recurringProfile.findUnique({ where: { id: profile.id } });
    assert.ok(updated);
    assert.equal(updated.cyclesRun, 1);
    assert.equal(updated.active, true);
    assert.ok(updated.nextRunDate > now);

    // Clean up
    await prisma.invoiceItem.deleteMany({ where: { invoice: { recurringProfileId: profile.id } } });
    await prisma.invoice.deleteMany({ where: { recurringProfileId: profile.id } });
    await prisma.recurringProfile.delete({ where: { id: profile.id } });
  });

  await t.test("multiple catch-up cycles update cyclesRun and nextRunDate", async () => {
    const now = new Date();
    // 4 days ago with daily frequency = 5 cycles (day -4, -3, -2, -1, 0)
    const pastDate = new Date(now.getTime() - 4 * 86400000);
    const profile = await prisma.recurringProfile.create({
      data: {
        entityId: entity.id,
        clientId: client.id,
        title: "Catchup Test",
        frequency: "CUSTOM_DAYS",
        intervalDays: 1,
        nextRunDate: pastDate,
        autoSend: false,
        itemsJson: JSON.stringify([{ description: "Item 1", quantity: 1, unitPriceCents: 5000 }]),
        currency: "USD",
        active: true,
      },
    });

    const results = await runDueProfiles(now);
    const result = results.find((r) => r.profile === "Catchup Test");
    assert.ok(result);
    assert.equal(result.generated, 5);

    const updated = await prisma.recurringProfile.findUnique({ where: { id: profile.id } });
    assert.ok(updated);
    assert.equal(updated.cyclesRun, 5);
    assert.equal(updated.active, true);

    // Clean up
    await prisma.invoiceItem.deleteMany({ where: { invoice: { recurringProfileId: profile.id } } });
    await prisma.invoice.deleteMany({ where: { recurringProfileId: profile.id } });
    await prisma.recurringProfile.delete({ where: { id: profile.id } });
  });

  await t.test("exhaustion deactivates profile after reaching endCycles", async () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 5 * 86400000);
    const profile = await prisma.recurringProfile.create({
      data: {
        entityId: entity.id,
        clientId: client.id,
        title: "Exhaustion Test",
        frequency: "CUSTOM_DAYS",
        intervalDays: 1,
        nextRunDate: pastDate,
        endCycles: 3,
        autoSend: false,
        itemsJson: JSON.stringify([{ description: "Item 1", quantity: 1, unitPriceCents: 5000 }]),
        currency: "USD",
        active: true,
      },
    });

    const results = await runDueProfiles(now);
    const result = results.find((r) => r.profile === "Exhaustion Test");
    assert.ok(result);
    assert.equal(result.generated, 3);

    const updated = await prisma.recurringProfile.findUnique({ where: { id: profile.id } });
    assert.ok(updated);
    assert.equal(updated.cyclesRun, 3);
    assert.equal(updated.active, false);

    // Clean up
    await prisma.invoiceItem.deleteMany({ where: { invoice: { recurringProfileId: profile.id } } });
    await prisma.invoice.deleteMany({ where: { recurringProfileId: profile.id } });
    await prisma.recurringProfile.delete({ where: { id: profile.id } });
  });

  await t.test("endDate passing deactivates profile", async () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 5 * 86400000);
    const endDate = new Date(now.getTime() - 1 * 86400000); // end date was yesterday
    const profile = await prisma.recurringProfile.create({
      data: {
        entityId: entity.id,
        clientId: client.id,
        title: "End Date Test",
        frequency: "CUSTOM_DAYS",
        intervalDays: 1,
        nextRunDate: pastDate,
        endDate: endDate,
        autoSend: false,
        itemsJson: JSON.stringify([{ description: "Item 1", quantity: 1, unitPriceCents: 5000 }]),
        currency: "USD",
        active: true,
      },
    });

    const results = await runDueProfiles(now);
    const result = results.find((r) => r.profile === "End Date Test");
    assert.ok(result);
    assert.equal(result.deactivated, true);

    const updated = await prisma.recurringProfile.findUnique({ where: { id: profile.id } });
    assert.ok(updated);
    assert.equal(updated.active, false);

    // Clean up
    await prisma.invoiceItem.deleteMany({ where: { invoice: { recurringProfileId: profile.id } } });
    await prisma.invoice.deleteMany({ where: { recurringProfileId: profile.id } });
    await prisma.recurringProfile.delete({ where: { id: profile.id } });
  });
});
