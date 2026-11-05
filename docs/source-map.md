# Source and contract map

This map describes the source on this branch. Open component PRs may add modules;
read their manifests and installed artifacts before claiming those modules ship.

| Question | Authoritative source | Contribution rule |
| --- | --- | --- |
| Public payload shapes | `src/types.ts` | Update declarations and callers together; consider compatibility and synthetic fixtures. |
| Runtime behavior and exports | `src/index.ts` | Trace actual request/error behavior; types alone are not runtime validation. |
| Package entry points, runtime, included files | `package.json` | Verify exports, engine range and the packed artifact rather than assuming source files ship. |
| Dependency resolution | `package-lock.json` | Use `npm ci`; keep intentional manifest/lock changes together. |
| Compiler output | `tsconfig.json` | Build emits `dist/`; inspect emitted JS and declarations for release changes. |
| CI and publishing | `.github/workflows/` | Read current triggers and required checks; local skills do not grant publication rights. |
| Optional access shapes and validation | `packages/access/src/schemas.ts` | Strict schemas are authoritative; inferred types/declarations, evaluator and synthetic fixtures move together. |
| Optional access enforcement and host trust | `packages/access/src/evaluator.ts`, `host.ts`, `client.ts`, `delegation.ts` | Evidence must originate in authenticated host bindings; read `packages/access/README.md` for every required guard and unsupported path. |
| Access artifact and SDK matrix | `packages/access/package.json`, `packages/access/PROVENANCE.md`, `packages/access/src/eve.ts` | Independently versioned; no mandatory reporting dependency. Inspect exact packed files and pinned SDK declarations; explicit host guards are not an extension interceptor. |
| Access vendoring baseline and read-only verification | `scripts/access-artifact/prepare.mjs`, `verify.mjs`, `core.mjs`, `artifacts/access/0.1.0/baseline.json` | Schema validation is in code; regenerate the baseline from the reviewed source/archive with [the update procedure](access-vendoring.md). Tools and baseline remain outside packed runtime files. |
| Contributor procedures | `.agents/skills/`, `docs/workflow.md` | These guide contributors; they are not installed runtime subagents. |

## Data and schema boundaries

This package has no database schema or migration runner. Payload interfaces describe
client inputs, not the receiver's storage schema or permission model. The receiver
owns persistence, authorization and migrations. Document field meaning, optionality,
identifiers and failure behavior alongside any API change, with synthetic examples.
Do not copy a consumer's database schema, tenant configuration or production samples.

The current base contains legacy deployment coupling that a separate migration must
remove. These contributor docs do not certify runtime neutrality. In particular, do
not invoke exported reporting functions against live services to verify setup.
Future configurable transport changes need mocked HTTP fixtures and a documented
wire contract; do not infer retry, durability or deduplication guarantees from names.

## Safe local checks

Use a Node version satisfying `package.json`'s engine constraint (currently >=20):

```sh
npm ci
npm run typecheck
npm run build
npm pack --dry-run --json
```

These commands install/build/typecheck/list package files; no runtime credentials
are required. The current base has no `test` or `lint` script. Do not report a test
suite as passed unless one exists and was executed on the candidate being reviewed.
Documentation-only changes need link, source-accuracy and content checks; they do
not require live reporting calls. Local installation may need registry access.

## Keeping references accurate

Link source definitions instead of maintaining a second schema by hand. Explain
relationships, ownership and invariants where code alone is insufficient. Update
references with the contract change and identify the reviewed source revision in PR
evidence. If generated API/schema docs are added, record the generator command,
input files, output location and a reproducibility check. No generated-reference
pipeline currently exists on this base. Never treat a generated snapshot as the
source of truth or edit it without updating its source.

Contributor documentation belongs to the repository. The manifest's current `files`
allowlist includes `dist`, so do not assume `.agents/`, `docs/` or these instructions
are present in an installed package. Installed instruction discovery requires its
own packaging and loader verification.
