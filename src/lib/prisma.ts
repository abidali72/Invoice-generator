import { PrismaClient } from "@prisma/client";

// Prisma singleton survives Next.js hot-reload in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** All data lives under the single seeded business entity (doc §12 base entity). */
export async function getEntity() {
  const entity = await prisma.entity.findFirst({ orderBy: { createdAt: "asc" } });
  if (!entity) throw new Error("No company entity found — run `npm run db:seed`.");
  return entity;
}
