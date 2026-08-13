#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <instance-env-file>" >&2
  exit 64
fi

environment_file="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(git -C "$script_directory" rev-parse --show-toplevel)"

"$script_directory/preflight-instance.sh" "$environment_file"

source_revision="$(sed -n 's/^SOURCE_REVISION=//p' "$environment_file")"
temporary_source="$(mktemp -d "${TMPDIR:-/tmp}/twenty-source.XXXXXX")"
source_archive="$temporary_source/source.tar"

cleanup() {
  rm -f "$source_archive"
  rmdir "$temporary_source" 2>/dev/null || true
}

trap cleanup EXIT

git -C "$repository_root" archive --format=tar --output="$source_archive" "$source_revision"
tar -xf "$source_archive" -C "$temporary_source"

BUILD_CONTEXT="$temporary_source" docker compose \
  --env-file "$environment_file" \
  -f "$script_directory/compose.yaml" \
  -f "$script_directory/compose.build.yaml" \
  build server
