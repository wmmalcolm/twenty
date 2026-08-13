#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <instance-env-file>" >&2
  exit 64
fi

environment_file="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(git -C "$script_directory" rev-parse --show-toplevel)"

if [ -L "$environment_file" ] || [ ! -f "$environment_file" ]; then
  echo "Instance environment must be a regular, non-symbolic-link file." >&2
  exit 66
fi

if environment_owner="$(stat -f %u "$environment_file" 2>/dev/null)"; then
  environment_mode="$(stat -f %Lp "$environment_file")"
else
  environment_owner="$(stat -c %u "$environment_file")"
  environment_mode="$(stat -c %a "$environment_file")"
fi

if [ "$environment_owner" != "$(id -u)" ] || [ "$environment_mode" != "600" ]; then
  echo "Instance environment must be owned by the current user with mode 0600." >&2
  exit 66
fi

if [[ "$environment_file" == "$repository_root/"* ]]; then
  echo "Refusing an environment file inside the Docker build context." >&2
  exit 65
fi

if [ -n "$(git -C "$repository_root" status --porcelain)" ]; then
  echo "Refusing to build from a dirty source checkout." >&2
  exit 65
fi

source_revision="$(sed -n 's/^SOURCE_REVISION=//p' "$environment_file")"
approved_source_revision="$(sed -n 's/^APPROVED_SOURCE_REVISION=//p' "$environment_file")"
approval_manifest="$(sed -n 's/^APPROVAL_MANIFEST=//p' "$environment_file")"
approval_manifest_sha256="$(sed -n 's/^APPROVAL_MANIFEST_SHA256=//p' "$environment_file")"
approved_scan_id="$(sed -n 's/^APPROVED_SCAN_ID=//p' "$environment_file")"

if [ -z "$source_revision" ] || [ "$source_revision" != "$(git -C "$repository_root" rev-parse HEAD)" ]; then
  echo "Environment SOURCE_REVISION does not match the clean source HEAD." >&2
  exit 65
fi

if [ "$approved_source_revision" != "$source_revision" ]; then
  echo "APPROVED_SOURCE_REVISION must match the exact source revision." >&2
  exit 65
fi

if [ -L "$approval_manifest" ] || [ ! -f "$approval_manifest" ]; then
  echo "APPROVAL_MANIFEST must be a regular, non-symbolic-link file." >&2
  exit 66
fi

if [[ "$approval_manifest" == "$repository_root/"* ]]; then
  echo "The approval manifest must be stored outside the source repository." >&2
  exit 65
fi

if [ "$(shasum -a 256 "$approval_manifest" | awk '{print $1}')" != "$approval_manifest_sha256" ]; then
  echo "Approval manifest does not match the operator-recorded SHA-256." >&2
  exit 65
fi

python3 - "$approval_manifest" "$source_revision" "$approved_scan_id" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
expected_revision = sys.argv[2]
expected_scan_id = sys.argv[3]
manifest = json.loads(manifest_path.read_text())
scan = manifest.get('scan', {})
target = scan.get('target', {})

if manifest.get('documentType') != 'codex-security.scan-manifest':
    raise SystemExit('Approval is not a Codex Security scan manifest')
if scan.get('status') != 'completed' or not scan.get('sealedAt'):
    raise SystemExit('Approval scan is not completed and sealed')
if not scan.get('artifacts'):
    raise SystemExit('Approval scan has no sealed artifacts')
if target.get('revision') != expected_revision:
    raise SystemExit('Approval scan target does not match source revision')
if scan.get('id') != expected_scan_id:
    raise SystemExit('Approval scan ID does not match operator approval')
scope = scan.get('scope', {})
if scope.get('includePaths') != ['.'] or scope.get('excludePaths') not in ([], None):
    raise SystemExit('Approval scan must cover the full repository scope')

for artifact in scan['artifacts']:
    artifact_path = manifest_path.parent / artifact['path']
    if not artifact_path.is_file() or artifact_path.is_symlink():
        raise SystemExit(f'Missing sealed artifact: {artifact_path}')
    import hashlib
    digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    if digest != artifact.get('sha256'):
        raise SystemExit(f'Sealed artifact digest mismatch: {artifact_path}')
PY

required_keys=(
  EMAIL_FROM_ADDRESS
  EMAIL_SMTP_HOST
  EMAIL_SMTP_USER
  EMAIL_SMTP_PASSWORD
)

for key in "${required_keys[@]}"; do
  value="$(sed -n "s/^${key}=//p" "$environment_file")"

  if [ -z "$value" ] || [[ "$value" == REPLACE_WITH_* ]]; then
    echo "Replace the placeholder value for $key before startup." >&2
    exit 65
  fi
done

echo "Exact-source and SMTP preflight passed for $source_revision."
