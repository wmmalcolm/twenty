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

"$script_directory/verify-private-workspace.sh" "$environment_file"
