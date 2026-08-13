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

if ! [[ "$instance_slug" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]]; then
  echo "Instance slug must contain only lowercase letters, numbers, and hyphens." >&2
  exit 64
fi

if ! [[ "$host_port" =~ ^[0-9]{2,5}$ ]] || ((host_port < 1024 || host_port > 65535)); then
  echo "Host port must be between 1024 and 65535." >&2
  exit 64
fi

if ! [[ "$server_url" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "Server URL must be an absolute HTTP or HTTPS URL." >&2
  exit 64
fi

umask 077
mkdir -p -m 0700 "$output_directory"

environment_file="$output_directory/$instance_slug.env"

if [ -e "$environment_file" ]; then
  echo "Refusing to overwrite existing environment file: $environment_file" >&2
  exit 73
fi

database_password="$(openssl rand -hex 32)"
redis_password="$(openssl rand -hex 32)"
encryption_key="$(openssl rand -base64 48 | tr -d '\n')"
application_secret="$(openssl rand -hex 48)"

cat >"$environment_file" <<EOF
COMPOSE_PROJECT_NAME=twenty-$instance_slug
SOURCE_REVISION=a96e3b46cb76a143695bdf8b9e7849e53a91b858
BIND_ADDRESS=127.0.0.1
HOST_PORT=$host_port
SERVER_URL=$server_url
PG_DATABASE_NAME=twenty
PG_DATABASE_USER=twenty_app
PG_DATABASE_PASSWORD=$database_password
REDIS_PASSWORD=$redis_password
ENCRYPTION_KEY=$encryption_key
APP_SECRET=$application_secret
EOF

chmod 0600 "$environment_file"
echo "$environment_file"
