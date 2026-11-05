# Candidate artifact provenance

Preserve the MIT license and upstream metadata on every copy. This module has its
own `0.1.0` version and lockfile; the reporting root is independently usable.
Source repository: https://github.com/sendbird-ai/eve-agent-reporting,
directory `packages/access`. A draft PR or local artifact is not a release.

`npm run build` runs the pinned TypeScript compiler and deterministic
`scripts/provenance.mjs`. It emits JS/declarations and `provenance.json`, containing
SHA-256 per source input, aggregate source-tree digest and per packed-file digest.
No credentials, prompts, generated instruction copies or runtime SDK are bundled.
Build inputs include source, schemas, tests, scripts, manifest, lockfile and docs.
The generated manifest excludes itself to avoid self-reference; the **external
archive SHA-256** authenticates it. A manifest loaded from an untrusted modified
installation is not an independent integrity check.

Before adoption record: exact reviewed upstream Git commit, package version,
archive SHA-256, trusted copy of `provenance.json`, consumer lockfile integrity and
license. Compare every packed file with that trusted manifest, including
declarations. Source-tree hashes supplement the Git commit; they do not substitute
for reviewed origin. The commit is recorded externally to avoid a self-referential
build. The package does not provide a production signing/provenance service.

Vendor the **tarball**, then install with npm 10 on Node 24. Runtime dependency is
exact `zod@4.6.7`; no Eve, reporting or messaging package is a dependency. Do not
copy only `dist` or resolve dependencies through an application's linked parent
directory. `check:artifact` proves an independently installed tarball still resolves
its exact dependency when the synthetic parent uses `zod@4.6.6`.

`check:sdk` authenticates these exact Eve npm archives with SHA-512 before reading
their shipped declarations:

| Version | SHA-512 (hex) |
| --- | --- |
| 0.27.2 | `bc62c7d77725cbc481acff002639eafe3042bcb29403acb8fb586a1d2f8df7dd8e1e59527470c625c734eb6d2ecf58dd6d6ce73fcbba50aece983e9ca2ca9384` |
| 0.66.2 | `18fbdf97bf2cb502e873133b32ae81ce98b0968a22a1f6f9efb3ab86dc8bc7bc194af80f83f2fac1d751653c8891b54b868658598be77ad027c14f87e38f27ed` |

The declaration checks establish source facts about extension, observe-only hooks
and forwarding API differences. Guard behavior tests run independently of Eve;
they are not end-to-end SDK compilation, route coverage, installed-extension
discovery or proof of deployed interception.

For updates, rebuild from the new reviewed commit with `npm ci`, repeat tests,
SDK inspection, artifact/neutrality checks and two independent host configurations.
Compare source and installed manifests. Any local modification is drift requiring
upstream review; do not maintain private policy forks in the shared component.
Breaking wire semantics need a new wire major and explicit negotiation; never
silently downgrade. Re-run private route inventory, supported-version checks,
revocation/security tests and owner review before rollout. Rollback disables
restricted paths or restores an approved exact artifact while retaining guards.
