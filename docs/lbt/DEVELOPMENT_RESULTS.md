# LBT development demonstration results — 2026-10-22

**The synthetic two-visit workflow works in the cloud development browser. It has not yet been verified on Bill's Mac.** Bill chose local Docker; a usable Mac daemon was verified through the supplied connected-Mac evidence. This cloud thread cannot execute commands or copy files directly on that Mac. Git fetch from the separate handoff branch is the supported transfer method. The source package and explicit-context launch method are in [DESKTOP_HANDOVER](DESKTOP_HANDOVER.md).

## Demonstrated behavior

| Check | Result and exact boundary |
| --- | --- |
| Authentication | Native Twenty password sign-in for four distinct synthetic accounts; native current-user/workspace checked on every portal request; tokens kept in process memory |
| Customer → facility → equipment | A deterministic native Twenty Company ID is linked from the dedicated facility/equipment schema; no duplicate customer master writer |
| Two-visit cycle | Exactly two visits under the approved 10 November 2026 equipment cycle; repeated generation does not duplicate it |
| Shared instrument | Overlapping reservations rejected with no partial booking; adjacent appointments accepted; simultaneous requests produce one winner |
| Assigned-only portal access | Employee A/B each see their assigned visit; direct cross-assignment commands denied; reassignment removes former access |
| Report files | Exact submitted synthetic text retrieved only with a valid session and current authorization; anonymous, other employee, forged token and disabled principal denied |
| Review | Separate reviewer approves current immutable version; replaced report needs a new approval; author cannot approve |
| Completion | Early closure denied; both execution records and current approvals required; concurrent closure has one winner; completed cycle rejects mutation |
| Operational atomicity | Injected failure after domain, audit, outbox and receipt writes leaves none committed and no version increment |
| Browser | Full scheduler → employee A/B → reviewer → scheduler path passed, including conflict error, download, completion, no page errors and mobile width |
| Persistence/restore | Full native PostgreSQL dump restored into a new database; all 12 LBT tables compared exactly, two report hashes verified, 16 native storage files copied and hash-checked |
| Native transaction helper | Ordinary repository insert **still fails rollback**; the explicit query-runner probe passes rollback, race and permission checks |
| Native RLS | **Unavailable**: actual mutation returns FORBIDDEN, feature disabled; user confirms no Enterprise license |
| Native generic access | Seeded member can read the synthetic native Company directly (HTTP 200). Portal policy does not secure native API access |
| Clean container build | PASS, linux/amd64 image exported; runtime creation BLOCKED by cloud vfs disk capacity/stale build lease. ARM64 build/runtime still pending |
| Mac deployment | Supplied read-only verification proves `colima-twenty` works, not that LBT is installed. Default `colima` is stopped; recruiting on port 3022 is separate and untouched |

The portable desktop smoke test also passed against a fresh disposable source-hosted database, exercising the complete fixture; it separately passed read-only checks on the retained completed example. This validates the portable test code, not packaged runtime. Evidence: [portable exercise](evidence/development/desktop-smoke-source-fresh.txt), [portable read-only](evidence/development/desktop-smoke-source-readonly.txt), [Docker build/blocker](evidence/development/docker-package.txt).

Evidence: [API workflow](evidence/development/workflow.txt), [browser](evidence/development/browser.txt), [completed screenshot](evidence/development/completed.png), [restore](evidence/development/restore.txt), [native workaround](evidence/development/native-transaction-workaround.txt), [native defect](evidence/development/native-repository-defect.txt), [native permission gate](evidence/development/native-permissions.txt), [native access boundary](evidence/development/native-access-boundary.txt).

## Architecture exercised

`packages/lbt-development` is a dedicated local LBT portal/service using published Twenty authentication/Company HTTP interfaces and its own transactional schema. Twenty remains the customer master. This is a concrete **alternative to the earlier native-app-first hypothesis**, motivated by the observed license and transaction boundaries. It is not an installed versioned Twenty app, and the user has not selected it as the final production architecture.

No Twenty core source or licensing check is patched. The older separate-service prototype and native probe objects remain historical experiments; they are not active second writers for this new workflow. The desktop compose exposes only the portal gateway; native Twenty APIs are internal. Production would need a complete access-path audit, real identity enrollment and a decision on who may use native Twenty directly. Merely hiding a UI control would not enforce that boundary.

The new operations path uses a single explicit PostgreSQL connection for transactions and domain audit/outbox. That is a tested avoidance of the native helper defect, not a claimed upstream fix. The separate native explicit-runner probe establishes a possible internal extension path, but native event emission still lacks demonstrated transactional outbox semantics.

## Version and license verification

- Source commit: `499a6474d2b2934659677d46a9c40fa881c5f94f` (fork `wmmalcolm/twenty`, commit dated 2026-08-13). No release tag resolves at this checkout; identify this build by commit, not “latest” or the root package's legacy `0.2.1` value.
- Source `.nvmrc` and selected toolchain: Node 24.16.0; Yarn 4.13.0. The native server was compiled from this source; no claim that this is an audited production release.
- Desktop Node base: `node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203`.
- PostgreSQL 16.10 and Redis 7.4.2 image digests are pinned in the compose file. No floating `latest` tag.
- Root LICENSE: AGPLv3 with Twenty Application Exception; designated SDK/UI packages use MIT; files marked `/* @license Enterprise */` use the commercial terms. RLS service is explicitly Enterprise-marked and requires valid plan **and** RLS entitlement.
- Commercial terms permit development/testing without subscription, but production use of commercial components requires the stated valid subscription. No entitlement was supplied, forged or toggled. No vendor quote or production license legal determination is claimed.
- Twenty development seed is not production identity: its broad administrative/impersonation privileges are another reason not to publish it or expose native API access to real employees.

## Not demonstrated

Fresh ARM64 build/runtime on Bill's Mac, production bundle/release, native assigned-only UI, full clinical qualification rules, actual measurement/report release, arbitrary recurrence, all 40 acceptance tests, multi-tenant deployment, provider notifications, production identity/SSO/MFA, external security review, load/availability, offsite backup encryption/retention, or a complete new-host disaster recovery. None is marked passed by these checks.

Desktop clean build status and package delivery status are recorded in DESKTOP_HANDOVER.md. Current cloud setup/start instructions are saved in the environment configuration draft; saving does not publish it. Review/save/publish there applies only to the development environment, not the CRM or Mac.

The handoff branch contains the reviewed synthetic code and evidence. No DNS, production deployment, external message/provider send, spending/license purchase or new persistent credential grant is part of this delivery. Local generated development database secrets and transient native sign-in sessions are not grants to external services.
