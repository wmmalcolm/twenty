# Private synthetic LBT development handoff

Read [the Mac executor handoff](docs/lbt/DESKTOP_HANDOVER.md) before starting. Verify this checkout against the immutable commit in the delivery report and check `docs/lbt/evidence/development/source-sha256.txt`.

This branch carries the LBT additions atop Twenty `499a6474d2b2934659677d46a9c40fa881c5f94f`, using the original upstream dependency lock. It does not change Twenty core source or Enterprise checks. The dedicated LBT workflow service is a tested architecture option, not a completed production CRM or installed native Twenty app.

Use explicit Docker context `colima-twenty`, project `lbt-private-development`, and available host-loopback port 4330. Never alter `twenty-will-recruiting` on 3022, its volumes, or its Colima VM. Run the preflight before building. The cloud image built for amd64; its runtime was blocked by cloud disk capacity. Build and verify ARM64 locally before claiming Mac access.

No runtime secrets, databases, tokens, uploaded research, or real client records are included. No production, domain, purchase or new security-grant work is authorized. The original cloud builder owns the implementation; the Mac executor runs and returns evidence for this same package.
