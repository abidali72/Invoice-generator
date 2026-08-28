import test, { describe, it, mock } from "node:test";
import assert from "node:assert";
import { prisma } from "./prisma";
import { audit, diff } from "./audit";

describe("audit module", () => {
  describe("audit()", () => {
    it("creates audit log with provided actor and changes", async () => {
      const originalCreate = prisma.auditLog.create;
      let createdData: any = null;
      const mockCreate = mock.fn(async (args: any) => {
        createdData = args.data;
        return { id: "log-1", ...args.data, createdAt: new Date() };
      });
      (prisma.auditLog as any).create = mockCreate;

      try {
        await audit({
          entityType: "INVOICE",
          entityId: "inv-123",
          actor: "user@example.com",
          action: "CREATE",
          summary: "Created invoice inv-123",
          changes: { status: "DRAFT" },
        });

        assert.strictEqual(mockCreate.mock.calls.length, 1);
        assert.deepStrictEqual(createdData, {
          entityType: "INVOICE",
          entityId: "inv-123",
          actor: "user@example.com",
          action: "CREATE",
          summary: "Created invoice inv-123",
          changesJson: JSON.stringify({ status: "DRAFT" }),
        });
      } finally {
        (prisma.auditLog as any).create = originalCreate;
      }
    });

    it("uses default actor and handles null/undefined changes", async () => {
      const originalCreate = prisma.auditLog.create;
      let createdData: any = null;
      const mockCreate = mock.fn(async (args: any) => {
        createdData = args.data;
        return { id: "log-2", ...args.data, createdAt: new Date() };
      });
      (prisma.auditLog as any).create = mockCreate;

      try {
        await audit({
          entityType: "CLIENT",
          entityId: "client-456",
          action: "DELETE",
          summary: "Deleted client client-456",
        });

        assert.strictEqual(mockCreate.mock.calls.length, 1);
        assert.deepStrictEqual(createdData, {
          entityType: "CLIENT",
          entityId: "client-456",
          actor: "admin@acme.studio",
          action: "DELETE",
          summary: "Deleted client client-456",
          changesJson: null,
        });
      } finally {
        (prisma.auditLog as any).create = originalCreate;
      }
    });

    it("catches error and logs via console.error when prisma.auditLog.create fails", async () => {
      const originalCreate = prisma.auditLog.create;
      const originalConsoleError = console.error;

      const dbError = new Error("Database connection lost");
      const mockCreate = mock.fn(async () => {
        throw dbError;
      });
      (prisma.auditLog as any).create = mockCreate;

      let consoleErrorCalls: any[] = [];
      const mockConsoleError = mock.fn((...args: any[]) => {
        consoleErrorCalls.push(args);
      });
      console.error = mockConsoleError as any;

      try {
        // audit() should catch error and NOT throw
        await assert.doesNotReject(async () => {
          await audit({
            entityType: "INVOICE",
            entityId: "inv-999",
            action: "UPDATE",
            summary: "Update test error path",
          });
        });

        assert.strictEqual(mockCreate.mock.calls.length, 1);
        assert.strictEqual(consoleErrorCalls.length, 1);
        assert.strictEqual(consoleErrorCalls[0][0], "[audit] failed to write log");
        assert.strictEqual(consoleErrorCalls[0][1], dbError);
      } finally {
        (prisma.auditLog as any).create = originalCreate;
        console.error = originalConsoleError;
      }
    });
  });

  describe("diff()", () => {
    it("returns shallow diff of before and after objects", () => {
      const before = { name: "Alice", status: "DRAFT", amount: 100 };
      const after = { name: "Alice", status: "PAID", amount: 200, extra: "new" };

      const result = diff(before, after);

      assert.deepStrictEqual(result, {
        status: { from: "DRAFT", to: "PAID" },
        amount: { from: 100, to: 200 },
        extra: { from: undefined, to: "new" },
      });
    });

    it("returns empty object when properties are identical", () => {
      const before = { a: 1, b: "test" };
      const after = { a: 1, b: "test" };

      const result = diff(before, after);

      assert.deepStrictEqual(result, {});
    });
  });
});
