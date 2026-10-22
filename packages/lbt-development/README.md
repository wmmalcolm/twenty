# Twenty-backed LBT development demonstration

A separate, synthetic-only local portal with real Twenty password authentication and a native Company reference. This is an executable architecture option for a non-Enterprise deployment, not the finished production architecture or an installed Twenty application.

- Twenty owns customer identity and the native Company master. No native operational objects are duplicate authoritative writers.
- The LBT service alone owns facility/equipment, the approved November cycle, two visits, reservations, report versions, decisions, audit and capture-only outbox in `lbt_development`.
- Every portal request validates the native token and current workspace, then loads an enabled server-side principal. Native tokens stay in process memory behind opaque HttpOnly cookies. Restart requires sign-in again.
- Employee lists/commands/file bytes check current assignment. Report downloads have no transferable signed links. Scheduler/reviewer roles are explicit local policy, separate from native Twenty roles.
- Native generic APIs are not proxied by this portal. The desktop compose publishes only the portal gateway. This is NOT a demonstration that the native Twenty UI provides assigned-only access without Enterprise.
- All workflow writes, audit, outbox and receipts share one explicit PostgreSQL transaction/connection. Exclusion constraints and cycle locks serialize resource booking and completion. This avoids the demonstrated native repository helper defect; it does not fix Twenty's helper.
- Reports/decisions/events reject UPDATE/DELETE/TRUNCATE. The database owner can defeat those triggers; infrastructure-level evidence immutability is not claimed.

The previous `lbt-operations` prototype and native seam probes are preserved. This package does not import them or migrate their data. No Twenty core source, Enterprise feature check or applied old migration was changed.

## Current cloud development

With the native feasibility database/server running:

```sh
source /workspace/toolchains/twenty-env.sh
node packages/lbt-development/server.cjs
node tests/lbt/development/workflow.cjs
node tests/lbt/development/browser.cjs
node tests/lbt/development/restore.cjs
```

The API workflow test creates/drops its own new database; browser demonstration populates the retained LBT development schema. After completion use `browser.cjs --capture-only` for screenshots, not a reset. The restore test restores a full native dump into a new isolated database and compares all LBT rows and file hashes. Never reset the retained demonstration to rerun a test.

## Deliberate limits

Single synthetic workspace, one fixed approved date and equipment, two visits, fixed staff mapping, one instrument and text reports. Synthetic execution can be recorded for the future fixture date. Real qualifications/clinical measurements, cancellation, arbitrary recurrence, client intake, full multi-tenant policy, provider delivery, professional release and billing are not implemented. No real data, production authentication enrollment or complete LBT acceptance is claimed.

Follow [desktop handover](../../docs/lbt/DESKTOP_HANDOVER.md) for Bill's Mac. Keep the demo accounts private; the upstream seed includes administrator/impersonation capabilities and must never become production employee enrollment.
