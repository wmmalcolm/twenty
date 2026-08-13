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

docker compose \
  --env-file "$environment_file" \
  -f "$script_directory/compose.yaml" \
  exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM core.workspace WHERE "deletedAt" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active workspace';
  END IF;

  IF (SELECT count(*) FROM core.user WHERE "deletedAt" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active owner user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM core.user
    WHERE "deletedAt" IS NULL AND "isEmailVerified" IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Every active user must verify email before launch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
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
      AND r."canUpdateAllSettings" IS TRUE
  ) THEN
    RAISE EXCEPTION 'The active user must own an active admin membership';
  END IF;
END
$$;

UPDATE core.workspace
SET
  "allowImpersonation" = false,
  "isPublicInviteLinkEnabled" = false,
  "workspaceDiscoverability" = 'HIDDEN'
WHERE "deletedAt" IS NULL;

UPDATE core.user
SET "canImpersonate" = false
WHERE "deletedAt" IS NULL;
SQL

docker compose \
  --env-file "$environment_file" \
  -f "$script_directory/compose.yaml" \
  stop server worker

docker compose \
  --env-file "$environment_file" \
  -f "$script_directory/compose.yaml" \
  exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" FLUSHDB >/dev/null'

docker compose \
  --env-file "$environment_file" \
  -f "$script_directory/compose.yaml" \
  up -d --wait server worker

"$script_directory/verify-private-workspace.sh" "$environment_file"
