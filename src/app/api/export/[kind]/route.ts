import { NextRequest } from "next/server";
import { exportCsv } from "@/lib/services/reports";
import { handle, type Ctx } from "@/lib/api";

const ALLOWED = new Set(["aging", "revenue-by-month", "revenue-by-client", "currency-exposure"]);

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!ALLOWED.has(kind))
    return Response.json({ ok: false, error: "Unknown report" }, { status: 404 });
  return handle(async () => {
    const csv = await exportCsv(kind);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kind}.csv"`,
      },
    }) as unknown as Response;
  });
}
