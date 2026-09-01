## 2025-05-20 - Prisma Projection for Financial Reports
**Learning:** Report aggregation queries in `src/lib/services/reports.ts` pull full invoice objects including unused text/JSON fields (`notes`, `terms`, `customFields`), leading to unnecessary payload and heap allocation during batch reporting.
**Action:** Always specify explicit `select` clauses in reporting queries to fetch only the required fields for calculations (`grandTotalCents`, `amountPaidCents`, `creditedCents`, `exchangeRate`, `status`, `dueDate`).
