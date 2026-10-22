#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
context=${LBT_DOCKER_CONTEXT:-colima-twenty}
case "$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')" in
  unix://*) ;;
  *) echo 'Refusing a non-local Docker endpoint.' >&2; exit 1 ;;
esac
[[ $# == 1 ]] || { echo 'Usage: bash infra/lbt/desktop/backup.sh NEW_BACKUP_DIRECTORY' >&2; exit 2; }
[[ ! -e "$1" ]] || { echo 'Backup destination must not already exist' >&2; exit 1; }
[[ -f .devenv/lbt-desktop/runtime.env ]] || { echo 'Desktop configuration missing' >&2; exit 1; }
umask 077
mkdir -p "$1"
backup=$(cd "$1" && pwd)
compose=(docker --context "$context" compose --project-name lbt-private-development --env-file .devenv/lbt-desktop/runtime.env -f infra/lbt/desktop/compose.yaml)
# Stop only the LBT application for a consistent database + file backup; never stop the recruiting stack.
[[ -n "$("${compose[@]}" ps --status running -q app)" ]] || { echo 'LBT app must be running before backup' >&2; exit 1; }
"${compose[@]}" stop app
trap '"${compose[@]}" start app >/dev/null' EXIT
"${compose[@]}" exec -T database pg_dump -U postgres -p 55433 -Fc --no-owner --no-acl lbt_twenty_feasibility > "$backup/database.dump"
# Copy through a temporary instance with the same isolated LBT file volume.
"${compose[@]}" run --rm --no-deps -T archive -C /data -czf - storage > "$backup/storage.tar.gz"
cp .devenv/lbt-desktop/runtime.env "$backup/runtime.env"
(cd "$backup" && shasum -a 256 database.dump storage.tar.gz runtime.env > SHA256SUMS)
printf 'Backup written to %s. Contains local secrets; keep private.\n' "$backup"
