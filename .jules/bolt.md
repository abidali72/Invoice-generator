# Bolt's Journal

## 2026-09-11 - Single pass aggregation for Dashboard report stats
**Learning:** Performing multiple `.filter()` calls over dataset arrays (such as aging reports) creates redundant intermediate array allocations and causes multiple linear passes ($O(k \cdot N)$).
**Action:** Aggregate bucket statistics and filtered subsets (like `dueSoon`) in a single pass ($O(N)$) using a `Record` or `Map` to track running counts and totals without intermediate array allocations.
