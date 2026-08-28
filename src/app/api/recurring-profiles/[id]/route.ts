import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, type Ctx } from "@/lib/api";
import { ApiError } from "@/lib/services/invoices";
import { runDueProfiles } from "@/lib/services/recurring";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  active: z.boolean().optional(),
  autoSend: z.boolean().optional(),
  nextRunDate: z.string().optional(),
  title: z.string().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const body = await req.json();
  const { id } = await ctx.params;
  return handle(async () => {
    const d = patchSchema.parse(body);
    const profile = await prisma.recurringProfile.update({
      where: { id },
      data: {
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.autoSend !== undefined ? { autoSend: d.autoSend } : {}),
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.nextRunDate ? { nextRunDate: new Date(d.nextRunDate) } : {}),
      },
    });
    await audit({
      entityType: "RECURRING_PROFILE",
      entityId: id,
      action: "UPDATE",
      summary: `Profile “${profile.title}” updated`,
      changes: d,
    });
    return ok(profile);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    const linked = await prisma.invoice.count({ where: { recurringProfileId: id } });
    if (linked > 0) {
      // Preserve history (§19): deactivate instead of hard delete.
      const p = await prisma.recurringProfile.update({
        where: { id },
        data: { active: false },
      });
      await audit({
        entityType: "RECURRING_PROFILE",
        entityId: id,
        action: "UPDATE",
        summary: `Profile “${p.title}” deactivated (${linked} generated invoices preserved)`,
      });
      return ok({ deactivated: true });
    }
    const p = await prisma.recurringProfile.delete({ where: { id } });
    await audit({
      entityType: "RECURRING_PROFILE",
      entityId: id,
      action: "DELETE",
      summary: `Profile “${p.title}” deleted`,
    });
    return ok({ deleted: true });
  });
}

/** POST /recurring-profiles/{id}/run — force one generation cycle now. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    const profile = await prisma.recurringProfile.findUnique({ where: { id } });
    if (!profile) throw new ApiError(404, "Profile not found.");
    if (!profile.active) throw new ApiError(409, "Profile is inactive.");
    // Temporarily aim nextRunDate at now so runDueProfiles picks it up.
    await prisma.recurringProfile.update({ where: { id }, data: { nextRunDate: new Date(0) } });
    const results = await runDueProfiles();
    if (!results.length)
      throw new ApiError(409, "Run produced no invoice — end conditions reached.");
    return ok(results);
  });
}
