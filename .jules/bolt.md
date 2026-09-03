# Bolt's Journal - Critical Learnings

## 2026-09-03 - Bounded Query Reuse & Intl.NumberFormat Caching
**Learning:** Avoid fetching entire tables into application memory to do in-memory filtering. Instead, maintain indexed database `where` filters (`status in OPEN_FOR_AGG`, `issueDate >= start`) and column projections (`select: { grandTotalCents, ... }`). Where composite endpoints (like `/api/reports/dashboard`) compute multiple metrics over identical bounded datasets (e.g. open invoices), reuse the pre-fetched bounded query result across helper functions (`getAging` and `getCurrencyExposure`) to eliminate redundant DB roundtrips safely. Additionally, caching `Intl.NumberFormat` instances in a Map keyed by `${locale}:${code}` drastically reduces CPU overhead during currency formatting.
**Action:** Always combine column projections with targeted index filters, and allow analytical helper functions to accept preloaded bounded query results. Cache heavy `Intl.NumberFormat` instances.
