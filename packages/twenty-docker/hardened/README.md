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
- Environment safety controls cannot be overridden by retained database config.
- Email verification is required.
- The application image must be built from this audited checkout or loaded from
  a verified export; registry pulls for it are disabled.
- Secret files are generated with mode `0600` in a mode `0700` directory.

Create an instance environment without printing any secret values:

```bash
./create-instance-env.sh bill 3021 http://127.0.0.1:3021 /secure/path
```

The generator refuses a dirty checkout, records the exact hardened commit, and
requires HTTPS for every non-loopback URL.

Build the audited image once:

```bash
./build-instance.sh /secure/path/bill.env
```

Before building, replace every SMTP placeholder in the environment file with a
working account and verified sender. The preflight refuses placeholders, a
dirty or mismatched source tree, environment files inside the build context,
and any source revision other than the exact clean commit. The wrapper builds
from a temporary `git archive` snapshot of that commit.

Start one isolated instance:

```bash
docker compose \
  --env-file /secure/path/bill.env \
  -f compose.yaml \
  up -d
```

The Compose file always binds the application to `127.0.0.1`. For a public VPS,
set `SERVER_URL` to the final `https://` domain. Complete the first-owner signup
through an SSH tunnel while the public firewall remains closed. To open the
verification link, map the final domain to `127.0.0.1` on the operator Mac and
tunnel local TCP port 443 to a temporary TLS proxy on the VPS that forwards only
to the loopback app. The TLS proxy must use the final domain certificate; do not
use plain HTTP or bypass certificate validation. Verify the owner's email, then
lock and verify the workspace:

```bash
./lock-private-workspace.sh /secure/path/clip2commit.env
./verify-private-workspace.sh /secure/path/clip2commit.env
```

Only after the verification command reports that the launch gate passed may DNS
be published and the existing TLS proxy become Internet reachable. Never expose
the backend port in the host firewall.

The lock command requires exactly one active, email-verified owner. It sets the
workspace hidden, disables its public invite link and impersonation, and then
checks all four conditions. Run this gate before loading real records. Keep one
encrypted backup set per Compose project and prove a restore before production
use.
