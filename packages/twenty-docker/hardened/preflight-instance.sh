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

if [ -z "$source_revision" ] || [ "$source_revision" != "$(git -C "$repository_root" rev-parse HEAD)" ]; then
  echo "Environment SOURCE_REVISION does not match the clean source HEAD." >&2
  exit 65
fi

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
