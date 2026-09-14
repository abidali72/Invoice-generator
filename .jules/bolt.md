## 2025-05-18 - Select-clause Optimization in Prisma Reports
**Learning:** Fetching full Prisma model instances (including large text columns like `notes`, `terms`, and `customFields`) during bulk reporting aggregations introduces substantial database I/O and serialization overhead.
**Action:** Always project only the minimal required scalar fields using Prisma `select` clauses in reporting queries.
