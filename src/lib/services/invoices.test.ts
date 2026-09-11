import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../prisma";
import { createInvoice, updateInvoice, ApiError } from "./invoices";

describe("Invoice service validation errors", () => {
  const mockEntity = {
    id: "entity-1",
    name: "Test Corp",
    defaultCurrency: "USD",
    defaultNotes: "Thank you",
    defaultTerms: "Net 30",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockClient = {
    id: "client-1",
    entityId: "entity-1",
    name: "Acme Corp",
    email: "acme@example.com",
    address: "123 Main St",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDraftInvoice = {
    id: "inv-1",
    entityId: "entity-1",
    clientId: "client-1",
    invoiceNumber: "INV-2026-0001",
    sequence: 1,
    status: "DRAFT",
    issueDate: new Date(),
    dueDate: new Date(),
    currency: "USD",
    exchangeRate: 1,
    subtotalCents: 1000,
    discountTotalCents: 0,
    taxTotalCents: 0,
    grandTotalCents: 1000,
    amountPaidCents: 0,
    creditedCents: 0,
    items: [],
  };

  beforeEach(() => {
    // Mock prisma client/entity/currencyRate/taxRate methods required for validation checks
    prisma.entity.findFirst = (async () => mockEntity) as typeof prisma.entity.findFirst;
    prisma.client.findFirst = (async ({ where }: { where?: { id?: string; entityId?: string } } = {}) => {
      if (where?.id === mockClient.id && where?.entityId === mockEntity.id) {
        return mockClient;
      }
      return null;
    }) as typeof prisma.client.findFirst;
    prisma.currencyRate.findUnique = (async () => null) as typeof prisma.currencyRate.findUnique;
    prisma.taxRate.findMany = (async () => []) as typeof prisma.taxRate.findMany;
    prisma.invoice.findUnique = (async ({ where }: { where?: { id?: string } } = {}) => {
      if (where?.id === mockDraftInvoice.id) {
        return mockDraftInvoice;
      }
      return null;
    }) as typeof prisma.invoice.findUnique;
  });

  describe("createInvoice", () => {
    test("throws ApiError 404 if client is not found", async () => {
      await assert.rejects(
        async () => {
          await createInvoice({
            clientId: "non-existent-client",
            currency: "USD",
            items: [{ description: "Item 1", quantity: 1, unitPrice: 100 }],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 404);
          assert.equal(err.message, "Client not found.");
          return true;
        }
      );
    });

    test("throws ApiError 400 if items array is empty", async () => {
      await assert.rejects(
        async () => {
          await createInvoice({
            clientId: mockClient.id,
            currency: "USD",
            items: [],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.equal(err.message, "At least one line item is required.");
          return true;
        }
      );
    });

    test("throws ApiError 400 if an item description is missing or blank", async () => {
      await assert.rejects(
        async () => {
          await createInvoice({
            clientId: mockClient.id,
            currency: "USD",
            items: [{ description: "   ", quantity: 1, unitPrice: 100 }],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.equal(err.message, "Every line item needs a description.");
          return true;
        }
      );
    });

    test("throws ApiError 400 if item quantity is zero, negative, or not finite", async () => {
      const invalidQuantities = [0, -1, NaN, Infinity];

      for (const qty of invalidQuantities) {
        await assert.rejects(
          async () => {
            await createInvoice({
              clientId: mockClient.id,
              currency: "USD",
              items: [{ description: "Valid item", quantity: qty, unitPrice: 100 }],
            });
          },
          (err: unknown) => {
            assert.ok(err instanceof ApiError);
            assert.equal(err.status, 400);
            assert.equal(err.message, "Quantity must be positive.");
            return true;
          }
        );
      }
    });

    test("throws ApiError 400 if item unit price is negative", async () => {
      await assert.rejects(
        async () => {
          await createInvoice({
            clientId: mockClient.id,
            currency: "USD",
            items: [{ description: "Valid item", quantity: 1, unitPrice: -50 }],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.equal(err.message, "Unit price cannot be negative.");
          return true;
        }
      );
    });
  });

  describe("updateInvoice", () => {
    test("throws ApiError 404 if invoice is not found", async () => {
      await assert.rejects(
        async () => {
          await updateInvoice("non-existent-inv", {
            clientId: mockClient.id,
            currency: "USD",
            items: [{ description: "Item 1", quantity: 1, unitPrice: 100 }],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 404);
          assert.equal(err.message, "Invoice not found.");
          return true;
        }
      );
    });

    test("throws ApiError 400 if items array is empty", async () => {
      await assert.rejects(
        async () => {
          await updateInvoice(mockDraftInvoice.id, {
            clientId: mockClient.id,
            currency: "USD",
            items: [],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.equal(err.message, "At least one line item is required.");
          return true;
        }
      );
    });
  });
});
