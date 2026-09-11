import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma, getEntity } from "@/lib/prisma";
import { createInvoice, ApiError } from "@/lib/services/invoices";

test("createInvoice tests", async (t) => {
  const entity = await getEntity();
  const client = await prisma.client.findFirst({ where: { entityId: entity.id } });
  assert.ok(client, "A seed client should exist in DB");

  await t.test("successfully creates a draft invoice with line items", async () => {
    const inv = await createInvoice({
      clientId: client.id,
      currency: "USD",
      items: [
        { description: "Development Work", quantity: 10, unitPrice: "100.00" },
        { description: "Design Systems", quantity: 2, unitPrice: 250 },
      ],
      notes: "Test invoice notes",
      terms: "Net 15",
      poNumber: "PO-TEST-001",
    });

    assert.ok(inv.id);
    assert.equal(inv.status, "DRAFT");
    assert.equal(inv.clientId, client.id);
    assert.equal(inv.currency, "USD");
    assert.equal(inv.notes, "Test invoice notes");
    assert.equal(inv.terms, "Net 15");
    assert.equal(inv.poNumber, "PO-TEST-001");
    // Subtotal: (10 * 10000) + (2 * 25000) = 100000 + 50000 = 150000 cents
    assert.equal(inv.subtotalCents, 150000);
    assert.equal(inv.grandTotalCents, 150000);

    // Verify items in DB
    const items = await prisma.invoiceItem.findMany({
      where: { invoiceId: inv.id },
      orderBy: { description: "asc" },
    });
    assert.equal(items.length, 2);
    assert.equal(items[0].description, "Design Systems");
    assert.equal(items[0].quantity, 2);
    assert.equal(items[0].unitPriceCents, 25000);
    assert.equal(items[1].description, "Development Work");
    assert.equal(items[1].quantity, 10);
    assert.equal(items[1].unitPriceCents, 10000);
  });

  await t.test("successfully creates invoice with discount and custom dates", async () => {
    const issueDate = new Date("2026-05-01T00:00:00.000Z");
    const dueDate = new Date("2026-06-01T00:00:00.000Z");

    const inv = await createInvoice({
      clientId: client.id,
      currency: "USD",
      issueDate,
      dueDate,
      items: [{ description: "Consulting", quantity: 1, unitPrice: 1000 }],
      discountType: "PERCENT",
      discountValue: 10,
    });

    assert.equal(inv.subtotalCents, 100000);
    assert.equal(inv.discountTotalCents, 10000);
    assert.equal(inv.grandTotalCents, 90000);
    assert.equal(inv.issueDate.toISOString(), issueDate.toISOString());
    assert.equal(inv.dueDate.toISOString(), dueDate.toISOString());
  });

  await t.test("throws 404 if client does not exist", async () => {
    await assert.rejects(
      async () => {
        await createInvoice({
          clientId: "non-existent-client-id",
          currency: "USD",
          items: [{ description: "Item", quantity: 1, unitPrice: 100 }],
        });
      },
      (err: unknown) => {
        return err instanceof ApiError && err.status === 404 && err.message === "Client not found.";
      }
    );
  });

  await t.test("throws 400 if items array is empty", async () => {
    await assert.rejects(
      async () => {
        await createInvoice({
          clientId: client.id,
          currency: "USD",
          items: [],
        });
      },
      (err: unknown) => {
        return err instanceof ApiError && err.status === 400 && err.message === "At least one line item is required.";
      }
    );
  });

  await t.test("throws 400 if item description is missing or blank", async () => {
    await assert.rejects(
      async () => {
        await createInvoice({
          clientId: client.id,
          currency: "USD",
          items: [{ description: "   ", quantity: 1, unitPrice: 100 }],
        });
      },
      (err: unknown) => {
        return err instanceof ApiError && err.status === 400 && err.message === "Every line item needs a description.";
      }
    );
  });
});
