#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <instance-env-file>" >&2
  exit 64
fi

environment_file="$1"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

docker compose \
  --env-file "$environment_file" \
  -f "$script_directory/compose.yaml" \
  run --rm --no-deps --entrypoint yarn server \
  node -e '
    const nodemailer = require("nodemailer");
    const port = Number(process.env.EMAIL_SMTP_PORT);
    const transport = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: process.env.EMAIL_SMTP_USER,
        pass: process.env.EMAIL_SMTP_PASSWORD,
      },
      tls: { rejectUnauthorized: true },
    });
    transport.verify()
      .then(() => { console.log("Authenticated SMTP TLS verification passed."); })
      .catch(() => { console.error("Authenticated SMTP TLS verification failed."); process.exit(1); });
  '
