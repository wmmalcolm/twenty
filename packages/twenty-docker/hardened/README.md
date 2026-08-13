# Hardened isolated deployment

This deployment is intentionally narrower than upstream Twenty defaults. It is
for one private workspace per Compose project and uses unique networks, volumes,
database credentials, Redis credentials, encryption material, and host ports.

Security defaults:

- The application port binds to loopback only.
- PostgreSQL and Redis have no host-published ports.
- PostgreSQL and Redis images are pinned by multi-architecture digest.
- Redis authentication is required.
- Social SSO, billing, analytics, telemetry, local code execution, local logic
  functions, and unauthenticated public workflow webhooks are disabled.
- The application image must be built from this audited checkout or loaded from
  a verified export; registry pulls for it are disabled.
- Secret files are generated with mode `0600` in a mode `0700` directory.

Create an instance environment without printing any secret values:

```bash
./create-instance-env.sh bill 3021 http://127.0.0.1:3021 /secure/path
```

Build the audited image once:

```bash
docker compose \
  --env-file /secure/path/bill.env \
  -f compose.yaml \
  -f compose.build.yaml \
  build server
```

Start one isolated instance:

```bash
docker compose \
  --env-file /secure/path/bill.env \
  -f compose.yaml \
  up -d
```

For a public VPS, keep `BIND_ADDRESS=127.0.0.1`, set `SERVER_URL` to the final
`https://` domain, and proxy that loopback port through a TLS-terminating reverse
proxy. Do not expose the backend port in the host firewall.

After the first owner completes onboarding, explicitly set the workspace to
hidden, disable its public invite link, and disable impersonation before loading
real records. Keep one encrypted backup set per Compose project and prove a
restore before production use.
