#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <instance-slug> <host-port> <server-url> <output-directory>" >&2
  exit 64
fi

instance_slug="$1"
host_port="$2"
server_url="$3"
output_directory="$4"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(git -C "$script_directory" rev-parse --show-toplevel)"
expected_remote_url="https://github.com/twentyhq/twenty.git"

if ! [[ "$instance_slug" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]]; then
  echo "Instance slug must contain only lowercase letters, numbers, and hyphens." >&2
  exit 64
fi

if ! [[ "$host_port" =~ ^[0-9]{2,5}$ ]] || ((host_port < 1024 || host_port > 65535)); then
  echo "Host port must be between 1024 and 65535." >&2
  exit 64
fi

if ! [[ "$server_url" =~ ^https://[^[:space:]]+$|^http://(127\.0\.0\.1|localhost)(:[0-9]{2,5})?$ ]]; then
  echo "Server URL must use HTTPS unless it is a loopback-only local URL." >&2
  exit 64
fi

if [ -n "$(git -C "$repository_root" status --porcelain)" ]; then
  echo "Refusing to generate an instance from a dirty source checkout." >&2
  exit 65
fi

remote_url="$(git -C "$repository_root" remote get-url origin)"

if [ "$remote_url" != "$expected_remote_url" ]; then
  echo "Refusing source with unexpected origin: $remote_url" >&2
  exit 65
fi

source_revision="$(git -C "$repository_root" rev-parse HEAD)"

if [ -L "$output_directory" ]; then
  echo "Refusing to use a symbolic-link output directory." >&2
  exit 73
fi

umask 077
mkdir -p -m 0700 "$output_directory"

if [ -L "$output_directory" ]; then
  echo "Refusing to use a symbolic-link output directory." >&2
  exit 73
fi

if output_directory_owner="$(stat -f %u "$output_directory" 2>/dev/null)"; then
  :
else
  output_directory_owner="$(stat -c %u "$output_directory")"
fi

if [ "$output_directory_owner" != "$(id -u)" ]; then
  echo "Refusing an output directory owned by another user." >&2
  exit 73
fi

chmod 0700 "$output_directory"

environment_file="$output_directory/$instance_slug.env"

if [ -e "$environment_file" ] || [ -L "$environment_file" ]; then
  echo "Refusing to overwrite existing environment file: $environment_file" >&2
  exit 73
fi

database_password="$(openssl rand -hex 32)"
redis_password="$(openssl rand -hex 32)"
encryption_key="$(openssl rand -base64 48 | tr -d '\n')"
application_secret="$(openssl rand -hex 48)"
temporary_file="$(mktemp "$output_directory/.${instance_slug}.env.XXXXXX")"

cleanup() {
  rm -f "$temporary_file"
}

trap cleanup EXIT

cat >"$temporary_file" <<EOF
COMPOSE_PROJECT_NAME=twenty-$instance_slug
SOURCE_REVISION=$source_revision
APPROVED_SOURCE_REVISION=REPLACE_AFTER_COMPLETED_CODEX_SECURITY_SCAN
APPROVAL_MANIFEST=REPLACE_WITH_ABSOLUTE_SCAN_MANIFEST_PATH
APPROVAL_MANIFEST_SHA256=REPLACE_WITH_OPERATOR_RECORDED_MANIFEST_SHA256
APPROVED_SCAN_ID=REPLACE_WITH_COMPLETED_CODEX_SECURITY_SCAN_ID
BIND_ADDRESS=127.0.0.1
HOST_PORT=$host_port
SERVER_URL=$server_url
PG_DATABASE_NAME=twenty
PG_DATABASE_USER=twenty_app
PG_DATABASE_PASSWORD=$database_password
REDIS_PASSWORD=$redis_password
ENCRYPTION_KEY=$encryption_key
APP_SECRET=$application_secret
EMAIL_FROM_ADDRESS=REPLACE_WITH_VERIFIED_SENDER
EMAIL_FROM_NAME=Twenty CRM
EMAIL_SMTP_HOST=REPLACE_WITH_SMTP_HOST
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=REPLACE_WITH_SMTP_USER
EMAIL_SMTP_PASSWORD=REPLACE_WITH_SMTP_PASSWORD
EOF

chmod 0600 "$temporary_file"

if ! ln "$temporary_file" "$environment_file"; then
  echo "Refusing to replace an environment file created concurrently." >&2
  exit 73
fi

rm -f "$temporary_file"
trap - EXIT
echo "$environment_file"
