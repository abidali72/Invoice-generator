# Bolt's Journal

## 2026-09-05 - Cache Intl.NumberFormat for Monetary Formatting
**Learning:** Instantiating `new Intl.NumberFormat()` on every invocation of monetary formatting functions creates huge CPU overhead (~70x slower) and garbage collection pressure during frequent re-renders and table generation.
**Action:** Always cache `Intl.NumberFormat` instances in a module-level `Map` keyed by locale and currency code when formatting numbers or currency values.
