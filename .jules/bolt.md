## 2025-05-18 - Explicit Prisma Select Projections on Aggregations
**Learning:** Full `prisma.invoice.findMany()` queries without explicit field selections load heavy text columns (`notes`, `terms`, `customFields`) and unused timestamps into memory across all records in reporting and KPI endpoints.
**Action:** Always specify explicit `select` blocks for report aggregation and summary functions to retrieve only required scalar fields.
