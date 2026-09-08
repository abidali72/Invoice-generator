## 2026-09-08 - Batch Audit Logging in Recurring Profile Engine
**Learning:** Performing single audit log writes inside multi-cycle catch-up loops (e.g. `runDueProfiles`) leads to N sequential database roundtrips. Batching audit entries using `prisma.auditLog.createMany` via `auditMany` reduces DB queries from O(N) to O(1) per execution loop while maintaining caller flow safety.
**Action:** When performing loop operations that record audit logs (or similar write-heavy logs), accumulate log entries and write them using `auditMany()` after loop completion.
