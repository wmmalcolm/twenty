# Bill's private Docker demonstration — 2026-10-22

## What is verified

The supplied connected-Mac verification reports Apple arm64, 18 host CPUs, 64 GiB host memory and about 607 GiB free disk. Docker CLI 29.7.2 / Compose 5.4.0 are installed. The `colima` default context is stopped. **Use explicit context `colima-twenty`**, whose Docker 29.5.2 daemon is aarch64 with 4 CPUs and about 11.66 GiB VM memory.

That daemon already runs `twenty-will-recruiting` on `127.0.0.1:3022`. It is a separate CRM; its records were not inspected. Never reuse its volume, restart its VM, change the global Docker context, or stop its containers. No LBT container has yet been verified on that Mac from this cloud task.

This cloud task has no Mac shell/file-transfer capability and no inbound preview capability. No URL in this cloud workspace is a browser link on Bill's Mac. The access method is a separate local Docker Compose project; completion of the Mac-side launch and browser check is still required.

## Package identity, transfer and remaining verification

The supported transfer route is the existing GitHub repository, `https://github.com/wmmalcolm/twenty.git`, branch `lbt-private-development-handoff`. The delivery report gives the immutable handoff commit. **The upstream base commit alone does not contain the LBT additions.** The branch retains the base source, original dependency manifests/lockfile, licenses, and adds only the synthetic portal, desktop scripts, tests and selected evidence. It excludes uploaded research, the earlier prototype, runtime configuration, databases, credentials and dependency folders.

A Mac executor should fetch into a **new directory outside the recruiting checkout**, verify the commit against the delivery report, and then run the commands below. Existing GitHub access may be reused; if fetch is denied, report that precise denial without enrolling a new credential or requesting a token in chat. This cloud builder has no Mac command or file-copy tool. A repository branch is a transfer artifact, not a live application or production publication.

```sh
git clone --single-branch --branch lbt-private-development-handoff https://github.com/wmmalcolm/twenty.git lbt-private-development
cd lbt-private-development
git rev-parse HEAD
# Compare this with the exact handoff commit in the delivery report before running it.
shasum -a 256 -c docs/lbt/evidence/development/source-sha256.txt
```

The clean cloud build completed shared libraries, client SDK, emails and **7,303 server source files**, then exported `lbt-private-development:499a6474`, image ID `sha256:0be2fa6f5760027c01d797191f71cc9a80984e602bc2a12ff4232b36bd51f58d`, **linux/amd64**, 4,075,607,051 bytes. That image is retained in the cloud daemon, not pushed to a registry. The Mac must build from source for **linux/arm64**; the pinned base-image manifests support ARM64, but the application has not been built or run on ARM64 here.

**Packaged runtime remains unverified.** The 32 GB cloud disk filled while Docker created the app container. Disposable build cleanup recovered about 2.9 GB, but Docker's `vfs` driver needs another full ~4.08 GB root filesystem copy. A stale build remains active in daemon history and cannot be reclaimed through supported prune commands. The daemon storage is not accessible to this non-root executor. The completed image, database volumes, source and test evidence were preserved; no unrelated data was removed. Daemon/environment administration would be needed to recover that cloud build lease. The source-hosted app remains usable for internal tests.

No new approval is needed for the already authorized isolated synthetic Mac deployment. The missing capability is a Mac executor using the existing local Docker context. Stop and report if port 4330 is occupied, the daemon has insufficient spare resources, repository access requires a new grant, or the context is unavailable. Do not stop another stack, resize/restart Colima, purchase a service, or change a domain to resolve those conditions.

## Isolation and access

The deliverable uses project `lbt-private-development`, image `lbt-private-development:499a6474`, its own `lbt-data` and `lbt-files` named volumes and **host loopback port 4330**. Only the portal gateway is published. Twenty's API, PostgreSQL and Redis have no host-published ports. It does not use port 3022.

Once launched successfully on Bill's computer, open **`http://127.0.0.1:4330` on that computer**. This is a supported local access method, not a verified live Mac deployment link. Use `127.0.0.1`, not `localhost`, because Host and Origin are exact-match controls.

Prerequisites are the existing Docker/Compose and running `colima-twenty` daemon, Git, OpenSSL, curl, and macOS `lsof` (or Python 3 for the port check). Host Node/Yarn/Playwright are not required for launch or the portable API smoke test. Network access is needed for GitHub, Docker Hub and Yarn packages. From the verified checkout:

```sh
env -u DOCKER_DEFAULT_PLATFORM bash infra/lbt/desktop/desktop.sh preflight
# Verify available shared VM memory/disk without changing the VM or recruiting stack.
env -u DOCKER_DEFAULT_PLATFORM bash infra/lbt/desktop/desktop.sh start
bash infra/lbt/desktop/desktop.sh check
bash infra/lbt/desktop/desktop.sh status
docker --context colima-twenty image inspect lbt-private-development:499a6474 --format '{{.Id}} {{.Architecture}}'
# Expect arm64 on Bill's Mac. Record the actual image ID and architecture.
# Only after health succeeds on the Mac:
open http://127.0.0.1:4330
```

Unless explicitly overridden for a documented cloud test, the script selects `colima-twenty` and does not start Colima or change its settings. Build requires network access to Docker Hub and Yarn package sources. No account creation, paid service or Enterprise key is needed for this synthetic demonstration. Local database/app secrets are generated once in `.devenv/lbt-desktop/runtime.env` and never printed. Preserve that directory; do not reuse its secrets for production.

The script pins Compose project `lbt-private-development` even if the calling shell has `COMPOSE_PROJECT_NAME` set. It checks 4330 before building, refuses a remote Docker endpoint, and refuses orphaned LBT resources without their local configuration. It allows restart of its own existing publisher. A port race is still rejected by Docker itself.

The source build is substantial. The application is limited to 2 runtime CPUs / 4 GiB, database 1 GiB, Redis 384 MiB; Docker build currently has a 4 GiB Node heap, not a whole-build resource limit. The 12 GiB shared VM is plausible but spare memory alongside recruiting must be checked locally. Do not resize or restart the VM automatically. ARM64 build/runtime remains unverified until run on the Mac; x86 cloud results are not ARM verification.

## Portable verification and executor receipt

`desktop.sh check` verifies health, not the full workflow. After successful startup, the executor can run the following dependency-free test **inside the existing app container**:

```sh
# Default: authenticate four synthetic users and check access without workflow mutations.
docker --context colima-twenty compose --project-name lbt-private-development --env-file .devenv/lbt-desktop/runtime.env -f infra/lbt/desktop/compose.yaml exec -T app node - < tests/lbt/development/desktop-smoke.cjs
# Complete the demonstration only if the operational dataset is empty.
# If already complete, validate it without resetting. If partly used, refuse to overwrite it.
docker --context colima-twenty compose --project-name lbt-private-development --env-file .devenv/lbt-desktop/runtime.env -f infra/lbt/desktop/compose.yaml exec -T app node - --exercise < tests/lbt/development/desktop-smoke.cjs
```

For a hands-on unfinished example, do the manual walkthrough below before `--exercise`; the automated test intentionally leaves a completed example. Never reset data to repeat it. The portable test covers native login, two visits, conflict rejection, independent report review, protected file bytes and completion; fault-injected rollback and concurrency evidence come from the stronger cloud API suite, not this smoke test.

Return a receipt to the original builder with: exact Git commit; context/daemon and app architecture; initial 4330 result; shared VM capacity; Compose service/health status; smoke output; browser sign-in and completed two-visit screenshot; backup/restore output; confirmation recruiting remains on 3022. Do not include runtime.env, cookies, tokens or database dumps. The original builder remains the implementation owner; this is local execution of the same build, not another CRM implementation.

## Walkthrough and accounts

Choose accounts in the portal; all use upstream synthetic password `tim@apple.dev`:

| Role | Account | Demonstration |
| --- | --- | --- |
| Scheduler | tim@apple.dev | Generate November cycle; book visits; complete after approvals |
| Employee A | jony.ive@apple.dev | See Visit 1; record synthetic execution; submit report |
| Employee B | phil.schiler@apple.dev | See Visit 2; record synthetic execution; submit report |
| Reviewer | jane.austen@apple.dev | Approve/reject current report versions |

1. Scheduler: Generate November cycle. Two visits reference the same facility/equipment and shared meter. Repeating generation creates no duplicate cycle.
2. Book Visit 1 at 14:00–15:00 UTC on 10 November 2026. Attempt Visit 2 at the same time: expect conflict with no partial save. Book Visit 2 at 15:00–16:00 instead.
3. Try completion: expect denial. Sign in as each employee, record synthetic execution and submit the prefilled synthetic report. Each employee sees only their visit.
4. Reviewer: download and approve both reports. A new report revision needs a new decision; an old approval cannot approve a replacement.
5. Scheduler: complete the cycle. Further report/booking mutations are denied. The activity list records events; notifications are captured only, never sent.

The cloud retained demonstration already reached completion; the desktop seed starts a new operational dataset. No production employee registration exists. The upstream development users have broad native privileges; do not expose the native API or promote these accounts to production.

## Administration and recovery

- `desktop.sh status`, `logs`, `check` are scoped to LBT; `stop` preserves its data. `start` reuses the same project and seeds Twenty only if empty.
- App restart invalidates portal sessions. Twenty tokens remain only in memory and are not placed in browser storage or backups.
- To disable a demo account, an administrator can update only `lbt_development.principals.active` through the LBT database; every request reloads that state. This is a development administration procedure, not a production admin UI. Never run this SQL against recruiting.
- Do not edit applied `schema.sql`; its checksum is validated. Future changes need a new migration. Do not use `down -v`, Docker prune, or a general database reset.
- Back up with `bash infra/lbt/desktop/backup.sh NEW_PRIVATE_DIRECTORY`. It pauses only the LBT application, dumps PostgreSQL, archives native file storage, saves local runtime configuration and checksums, then restarts LBT. The backup includes secrets; keep it in owner-controlled protected storage.
- `bash infra/lbt/desktop/verify-restore.sh BACKUP_DIRECTORY` restores into a new random database, checks the dump and prints cycle/report/decision counts, then removes only its temporary database. It never replaces the working database.
- A full disaster recovery to new volumes also needs the exact image/source, saved runtime secrets and file archive. Perform that on a separately named recovery project and validate login, file downloads and permissions before cutover; that entire desktop disaster-recovery procedure is not yet demonstrated.

Cloud data restoration was demonstrated against a new database with all 12 LBT tables compared exactly, both report hashes checked and 16 native files copied/hash-verified. See [restore evidence](evidence/development/restore.txt). Desktop backup scripts still require Mac validation; they are not the evidence source for that cloud result.

## Ownership and costs

| Choice | Cost and tradeoff | Current decision |
| --- | --- | --- |
| Private Docker on Bill's existing Mac | $0 additional hosting/license purchase for this test; uses existing hardware, disk and power; not always-on hosting | Selected; existing daemon verified by connected-Mac evidence |
| Production dedicated LBT portal with Twenty behind it | No Enterprise license assumed; requires engineering and review of identity, every access path, file revocation, audit and operations; engineering price not quoted | Demonstration option, not production acceptance |
| Native Twenty employee UI with assigned-only records | Valid Enterprise/RLS entitlement required at this source pin; current commercial price/seat minimum needs a vendor quote, not verified here | No license owned, no purchase authorized |
| Later LBT-owned always-on host for portal.lbtradphysics.com | Hosting, backups, monitoring and administration costs depend on provider/region/capacity; no account selected or quote obtained | Deferred; no LBT server access available |

No production publication, domain change, provider enrollment, spending or new persistent credential grants occurred. All source, data and future hosting remain under LBT's control. The future production license/source-distribution obligations must follow the exact deployed components; this demonstration does not waive them.
