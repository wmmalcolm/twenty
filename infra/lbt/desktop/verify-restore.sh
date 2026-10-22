#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
context=${LBT_DOCKER_CONTEXT:-colima-twenty}
case "$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')" in
  unix://*) ;;
  *) echo 'Refusing a non-local Docker endpoint.' >&2; exit 1 ;;
esac
[[ $# == 1 && -f "$1/database.dump" ]] || { echo 'Usage: bash infra/lbt/desktop/verify-restore.sh BACKUP_DIRECTORY' >&2; exit 2; }
backup=$(cd "$1" && pwd)
(cd "$backup" && shasum -a 256 -c SHA256SUMS)
compose=(docker --context "$context" compose --project-name lbt-private-development --env-file .devenv/lbt-desktop/runtime.env -f infra/lbt/desktop/compose.yaml)
target="lbt_restore_$(openssl rand -hex 8)"
"${compose[@]}" exec -T database createdb -U postgres -p 55433 "$target"
trap '"${compose[@]}" exec -T database dropdb -U postgres -p 55433 "$target" >/dev/null' EXIT
"${compose[@]}" exec -T database pg_restore -U postgres -p 55433 --exit-on-error --no-owner --no-acl -d "$target" < "$backup/database.dump"
"${compose[@]}" exec -T database psql -U postgres -p 55433 -d "$target" -v ON_ERROR_STOP=1 -c "SELECT status,count(*) FROM lbt_development.cycles GROUP BY status; SELECT count(*) AS reports FROM lbt_development.reports; SELECT count(*) AS decisions FROM lbt_development.decisions;"
printf 'Restore into fresh database succeeded; original LBT database was not replaced.\n'
