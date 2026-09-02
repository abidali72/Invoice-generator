# Bolt's Journal - Critical Performance Learnings

## 2025-02-14 - Prisma Query Projection in Report Aggregations
**Learning:** In Prisma + SQLite / SQL queries, `prisma.invoice.findMany()` without explicit `select` projects all model columns into memory and JS objects. When fetching hundreds or thousands of records for report calculations (such as financial summaries, aging, monthly revenue, and client totals), retrieving unneeded fields like `notes`, `terms`, `customFields`, and full nested objects causes major overhead in serialization and Prisma model hydration (up to ~4x slowdown).
**Action:** Always project only the required fields using explicit `select` blocks in report or aggregation queries to minimize memory footprint and database read payload.
