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
      AND ("isEmailVerified" IS NOT TRUE OR "canImpersonate" IS NOT FALSE)),
  (SELECT count(*)
    FROM core.user u
    JOIN core."userWorkspace" uw
      ON uw."userId" = u.id AND uw."deletedAt" IS NULL
    JOIN core.workspace w
      ON w.id = uw."workspaceId" AND w."deletedAt" IS NULL
    JOIN core."roleTarget" rt
      ON rt."userWorkspaceId" = uw.id AND rt."workspaceId" = w.id
    JOIN core.role r
      ON r.id = rt."roleId" AND r."workspaceId" = w.id
    WHERE u."deletedAt" IS NULL
      AND u."canAccessFullAdminPanel" IS TRUE
      AND r."canUpdateAllSettings" IS TRUE);
SQL
)"

if [ "$gate_result" != "1|0|1|0|1" ]; then
  echo "Private-workspace launch gate failed: $gate_result" >&2
  exit 1
fi

echo "Private-workspace launch gate passed."
