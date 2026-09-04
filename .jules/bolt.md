## 2025-05-18 - Batch Auditing & Prisma Column Projections
**Learning:** In bulk processing like reminder dispatches, sequential single-row audit logging causes $N$ database roundtrips. Additionally, un-projected `findMany` calls in dashboard report queries load large unneeded text fields (notes, terms, customFields) into memory.
**Action:** Use `auditMany` for batch auditing operations and always specify `select` clauses on Prisma queries in aggregation/reporting services.
