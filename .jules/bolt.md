# Bolt's Performance Journal

## 2026-08-30 - Prisma default findMany vs Select projections
**Learning:** Calling `prisma.invoice.findMany()` without a `select` clause fetches all columns including heavy text fields (`notes`, `terms`, `customFields`). When generating dashboard summaries or aggregated reports, selecting only required scalar fields reduces database payload size and Node.js object allocation overhead.
**Action:** Always specify explicit `select` fields in Prisma reporting and aggregation queries to avoid over-fetching unused columns.
