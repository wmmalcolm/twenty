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

After the final Codex Security diff scan completes, set
`APPROVED_SOURCE_REVISION` to its exact reviewed commit and
`APPROVAL_MANIFEST` to the absolute path of its completed, sealed
`scan-manifest.json`. Store that manifest outside this repository. The preflight
rejects a local commit that is not bound to that external review artifact.
After the image build, the wrapper performs an authenticated TLS SMTP handshake
and refuses to continue if the server, credentials, or certificate fail.

Start one isolated instance:

```bash
docker compose \
  --env-file /secure/path/bill.env \
  -f compose.yaml \
  up -d
```

The Compose file always binds the application to `127.0.0.1`. Bootstrap a public
VPS with a loopback URL such as `http://127.0.0.1:3023`, then complete first-owner
signup and open the email-verification link through an SSH tunnel to that port.
The link remains loopback-only and never crosses the network in plaintext. After
verification, stop the instance, change `SERVER_URL` in its protected environment
file to the final `https://` domain, run the preflight again, and start the
instance. Keep public DNS, the TLS proxy listener, and the firewall ingress closed
through this bootstrap and configuration change. Then lock and verify the
workspace:

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
