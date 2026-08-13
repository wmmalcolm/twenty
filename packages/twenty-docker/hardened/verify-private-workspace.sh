#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <instance-env-file>" >&2
  exit 64
fi

environment_file="$1"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

if [ -L "$environment_file" ] || [ ! -f "$environment_file" ]; then
  echo "Instance environment must be a regular, non-symbolic-link file." >&2
  exit 66
fi

gate_result="$(
  docker compose \
    --env-file "$environment_file" \
    -f "$script_directory/compose.yaml" \
    exec -T db sh -c \
    'psql -v ON_ERROR_STOP=1 -At -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT
  (SELECT count(*) FROM core.workspace WHERE "deletedAt" IS NULL),
  (SELECT count(*) FROM core.workspace
    WHERE "deletedAt" IS NULL
      AND (
        "allowImpersonation" IS NOT FALSE
        OR "isPublicInviteLinkEnabled" IS NOT FALSE
        OR "workspaceDiscoverability" <> 'HIDDEN'
      )),
  (SELECT count(*) FROM core.user WHERE "deletedAt" IS NULL),
  (SELECT count(*) FROM core.user
    WHERE "deletedAt" IS NULL
      AND ("isEmailVerified" IS NOT TRUE OR "canImpersonate" IS NOT FALSE));
SQL
)"

if [ "$gate_result" != "1|0|1|0" ]; then
  echo "Private-workspace launch gate failed: $gate_result" >&2
  exit 1
fi

echo "Private-workspace launch gate passed."
