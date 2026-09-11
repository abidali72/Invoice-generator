import { prisma } from "@/lib/prisma";
import { CURRENCY_CATALOG } from "@/lib/types";

/** Live look-up with catalog fallback; returned value is snapshotted onto invoices. */
export async function resolveExchangeRate(
  code: string,
  ratesMap?: Map<string, number>
): Promise<number> {
  const upper = code.toUpperCase();
  if (ratesMap && ratesMap.has(upper)) return ratesMap.get(upper)!;
  const row = await prisma.currencyRate.findUnique({ where: { code: upper } });
  if (row) return row.rateToBase;
  if (upper === "USD") return 1;
  // Conservative fallback: unknown codes treated as 1:1 with a warning.
  console.warn(`[currency] no FX row for ${upper}; locking rate=1`);
  return 1;
}

export async function listRates() {
  const rows = await prisma.currencyRate.findMany({ orderBy: { code: "asc" } });
  if (rows.length) return rows;
  // Catalog fallback when seed hasn't run
  return Object.entries(CURRENCY_CATALOG).map(([code, meta]) => ({
    code,
    symbol: meta.symbol,
    name: meta.name,
    rateToBase: code === "USD" ? 1 : 0,
    updatedAt: new Date(),
  }));
}

export async function upsertRate(input: {
  code: string;
  symbol?: string;
  name?: string;
  rateToBase: number;
}) {
  const code = input.code.toUpperCase();
  const meta = CURRENCY_CATALOG[code];
  return prisma.currencyRate.upsert({
    where: { code },
    create: {
      code,
      symbol: input.symbol ?? meta?.symbol ?? code,
      name: input.name ?? meta?.name ?? code,
      rateToBase: input.rateToBase,
    },
    update: { rateToBase: input.rateToBase },
  });
}

/** Convert invoice-local minor units into entity base-currency minor units. */
export function toBase(localCents: number, exchangeRate: number): number {
  return Math.round(localCents * exchangeRate);
}
