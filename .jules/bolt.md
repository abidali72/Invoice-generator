## 2026-09-13 - Batch Reminder Updates & Audit Logs
**Learning:** Processing reminder dispatches sequentially using individual `prisma.reminder.update` and `audit()` calls causes up to 400 DB queries per 200 items batch (~700ms+ latency).
**Action:** Always batch status updates with `prisma.reminder.updateMany` and write audit log entries in bulk with `auditMany` (`prisma.auditLog.createMany`).
