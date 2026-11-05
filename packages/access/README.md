# Optional agent access core

`@bshaan77/agent-access@0.1.0` is an independently versioned candidate. It has no
reporting, messaging transport or Eve runtime dependency. Node 24 / npm 10 are
supported. Nothing is published or enabled by installing this package. Review
[public issue #11](https://github.com/sendbird-ai/eve-agent-reporting/issues/11).

The schemas in `src/schemas.ts` are authoritative; installed `dist/schemas.d.ts`
declarations derive from them. There is no second JSON schema or runtime prompt.
Exports at `.` include strict schemas/types, `evaluate`, `digestRequest`,
`createDelegationVerifier`, `createAccessHost`, `createAccessClient`,
`BOUNDARY_ACTIONS` and `AccessDeniedError`. `./eve` exports
`createEveHostGuards` and `EVE_HOST_GUARD_MATRIX`.

## Authority

Only trusted host code may install bindings. Authenticate the transport and exact
machine registration outside the request body. Resolve the active original human
from verified issuer/workspace/user mappings, complete groups and current epochs.
`providerSubjectId` is the opaque provider subject; `channelIdentity` contains
verified workspace/user IDs. Neither names, employment, group eligibility nor
observed usage grants permission. Workloads require separate current registration,
purpose, job, owner evidence and scope, as well as explicit agent grants.

`evaluate(request, evidence, now, delegation?)` is a pure deterministic evaluator
of trusted evidence. Calling it with model-authored evidence establishes no
authentication. `createAccessHost` calls a trusted `resolve` binding on every
boundary. That binding must return the strictly validated `{ request, evidence,
delegationToken? }` envelope from authenticated services and actual server handles.
Never expose this binding, its context/operation handles, policy, evidence or
principal selection as a model tool argument. Never accept a context ID posted
by an unauthenticated caller as proof of identity.

The host resolves the **complete union** of contributing resources before context
or delivery, including derived summaries, titles, previews, attachments and
cached content. Request resources must exactly equal trusted provenance and source
authorization evidence. `personal` source denial returns
`PERSONAL_AUTH_REQUIRED`; no broader credential retry exists. Explicit
`approved-shared` mode must be independently authorized by the host and source
owner. Enforce upstream queries before retrieving bytes into model context.
Each source authorization also binds the exact actor, principal epoch and agent.
Channel `audienceEvidenceId` must equal the trusted destination evidence ID;
artifact `audienceBindingId` must equal the trusted destination binding ID.

## Policy and decisions

Wire schema `1.0` is distinct from package and immutable policy versions. Unknown
fields/versions, wildcard selectors, unknown variants, duplicate sets, missing
evidence and oversized payloads deny. Limits are 160 bytes of ASCII identifier
characters, 256 entries per collection and 512 KiB per parsed object. Empty sets
mean nothing. Schema exports validate shape; `evaluate` additionally enforces
cross-field, epoch, freshness and authorization invariants.

An operation requires independent `agent.use` and action rights, except designated
administration/audit and viewer-only `artifact.open`. Admin/audit need both their
explicit capability and designated human role. A binding or group registry entry
is not a grant. Each resource needs a **complete** matching grant covering action,
tool, corpus, resource and destination; partial grants cannot form a Cartesian
product. Matching revoked grants deny. Each corpus requires current source-owner
approval of the exact resource revision and audience/destination. Additions
default to `review-each-addition`: every subject must be reviewed. Explicit
`approved-dynamic-group` permits additions only within the owner-approved stable
groups; removal still takes effect. Host policy administration must authenticate
and verify the approval evidence IDs, immutable publication, reviewer authority
and every widening; an ID in a model request is not evidence.

The acting principal needs send rights. Every actual recipient separately needs
`delivery.send` entitlement for every source and destination; recipients do not
need agent invocation rights. Artifact create also requires send rights, while
every open/version/embed/download/export must recheck the actual viewer's
`artifact.open`. Unsupported equivalent open-time ACLs deny. Public,
organization-wide and bearer-only artifact stores are unsupported for restricted
content. A private message does not repair a broader artifact ACL.

Private responses require exactly the intended subject. `destination.kind:
"channel"` requires a trusted exact workspace/conversation binding and complete,
internal DM/group-DM/private-channel classification. External, shared,
pending-share, public or incomplete audiences deny the entire output. The host
must enumerate all pages and map every member; unknown identities/bots deny.
There is no recipient dropping or destination fallback.

Freshness is an absolute observation interval, never a cache-read timestamp.
Identity/groups/registration cap at 120 seconds, policy/current-epoch/source/
provenance evidence at 15 seconds, destination membership at 5 seconds, and
decisions at 15 seconds and **every** contributing expiry (including delegation).
Future observations, invalid clocks and reversed/overlong intervals deny. These
are engineering bounds, not measured revocation guarantees. Current principal,
mapping, policy and client epochs must match; observed revocation denies. Every
host boundary needs authoritative online current evidence; outage cannot reuse a
cached allow. Denials have `validUntil === evaluatedAt` and no reusable lifetime.

An allow needs a durable audit intent already persisted by the trusted host,
bound to decision ID and full normalized request digest. The host records outcome
after execution. `run` executes one callback and never retries uncertain effects.
An exception yields `OPERATION_OUTCOME_UNKNOWN`; an outcome-audit failure yields
`AUDIT_OUTCOME_UNKNOWN`, neither establishes rollback. The private service owns
append-only receipts, deduplication/reconciliation and policy mutations.

`createAccessClient` is a fail-closed remote decision adapter. Its trusted
`decideAuthenticated` port must authenticate service responses and its `current`
port must perform an online epoch check on every call. The latter returns the
current policy version/epoch, principal epoch and an absolute `validUntil` capped
by **all** required inputs. The client validates the full decision shape, digest,
epochs, evidence and expiry. Timeout/authentication/parse failure denies and
records only `{ reason, requestDigest }`; raw provider errors never escape. It
contains no destination URL, credentials, offline fallback or positive cache.

## Delegation

Install `createDelegationVerifier({ issuer, audience, maxDepth, edges }, ports)`
in trusted startup code. Each exact permitted edge contains `fromAgentId`,
`toAgentId`, `machineClientId`, `issuer`, `audience`. The receiving audience must
include the exact service/agent and environment in the host's private mapping.
`maxDepth` defaults to **3**; a host can lower it to 1 or 2, and the generic hard
ceiling is 8. Private profiles must explicitly retain their reviewed lower cap.

`authenticate(token, signal)` must authenticate **every** root-to-leaf claim using
the private host's verified server bindings or approved cryptographic verification.
It must verify keys/algorithm, issuer and audience before returning claims; plain
decoding, a type assertion, SDK forwarded attributes or caller JSON are not proof.
This package deliberately provides no generic production signer or identity
service. `consume({ issuer, audience, jti, expiresAt }, signal)` must be a durable,
atomic insert-if-absent shared by all workers, retained through expiry. Failure or
replay denies. A retry requires a new reviewed operation/token, not reuse of a
previous authorization.

Real code parses bounded claims, validates every edge, original principal/mapping
epochs, initiator, parent/chain/depth, target/client, run/job, full request digest,
scope intersection, 60-second maximum lifetime and temporal bounds. A child
cannot outlive or widen an ancestor. Zero future-clock tolerance is conservative
within a five-second maximum skew profile; expiry is never extended. Only after
authentication and replay consumption does the verifier mint a module-private
WeakMap handle. Passing an object or cast cannot manufacture one. The pure core
revalidates the handle against the request and time; callee policy/source rights
remain required. Host authorization obtains a new handle for every operation.

## Host integration and Eve matrix

This candidate supplies **SDK-independent host guards**, not a `defineExtension`
mount or observation hook. Both Eve 0.27.2 and 0.66.2 have inspected, hash-pinned
archives and tested explicit guard adapters. No installed extension discovery or
automatic interception is claimed. Other versions throw `UNSUPPORTED_RUNTIME`.
An SDK upgrade is a separate reviewed change.

| Exact Eve version | Inspected SDK fact | Supported adapter mode |
| --- | --- | --- |
| 0.27.2 | `defineExtension` exists; hooks run after durable recording; no `forwardPrincipal`/`trustedForwarders` | Explicit host guards; cross-agent identity requires a verified private gateway or stays disabled |
| 0.66.2 | Same observe-only hooks; `forwardPrincipal` and `trustedForwarders` exist | Explicit host guards; forwarding is still not delegation verification |

The old HTTP `onMessage` can return null. The newer channel has different
pre-dispatch semantics and message-free paths. Neither is a universal guard.
Do not treat a successful dispatch as authorization for a later operation.

| Required placement | Host obligation |
| --- | --- |
| `dispatch`, `job` | Authenticate current actor/workload before context, credential lookup or model dispatch; recheck wake, continuation, approval resume and every queued retry |
| `retrieval` | Resolve exact upstream scope and source credentials before every source/discovery/query call; retain existing personal authentication and narrower source controls |
| `context` | Gate history, attachments, tool results, memory, cached bytes, compaction and session read/replay/export **before** model/viewer access |
| `tool`, `developer` | Wrap every execute, built-in, sandbox, remote/MCP call, subagent and consequential write; retain repository/path/branch, human approval and credential separation |
| `send` / `releaseBuffered` | Buffer restricted output in host storage; check complete actual audience and provenance immediately before each message, stream chunk, progress/reasoning/tool event, edit, upload, unfurl and retry |
| `artifactCreate`, `artifactOpen` | Guard every create/revision/share and every viewer/content/version/preview/download/export/signed-link path, including platform owner/moderator paths |
| `administer`, `audit` | Authenticate designated role plus separate capability before policy mutation or audit reads |

Use `guards.guarded(boundary, trustedContext, trustedOperation, execute)` or
`host.run(...)` directly around the real operation. `releaseBuffered` authorizes
only the final send callback; it does not itself capture model output or discover
provenance. The callback must send the exact bytes/audience represented by the
immutable operation handle and must not retain a reusable permit. Partition
sessions/caches by tenant, agent, environment, verified subject/mapping/principal
epoch, complete authorized resource scope and policy epoch. Reauthorize all
retained sources after membership expansion; invalidate old entries and
cancel/quarantine affected jobs when epochs change. These storage/transport
controls belong in the private host.

Disable unwrapped SDK/default sends, built-ins, remote connections, stored stream
endpoints and unsupported artifact publishers. A pre-send check is not atomic
with a platform send; measure race windows and revocation behavior before enabling
restricted output. This package does not claim to recall delivered copies or
prove consumer security/provider readiness.

## Build, adoption and rollback

From this directory, use Node 24/npm 10:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run check:sdk -- /path/to/exact-eve-archives
npm run check:artifact -- /path/to/artifact-output
```

`check:artifact` packs the real candidate, checks neutrality and exact contents,
installs it in isolation with a different parent Zod version, verifies declarations,
runs two synthetic host configurations from the installed package, and checks
tamper detection. It leaves the tarball, checksum and per-file manifest in the
output directory. See [provenance requirements](PROVENANCE.md).

Adopt the exact reviewed `.tgz` with `file:vendor/<exact-archive>.tgz`, retaining
MIT license, upstream source commit, archive SHA-256 and per-file manifest. Commit
the consumer lockfile and verify installed `zod@4.6.7` belongs to this package;
an existing application's different Zod version must not replace it. Folder links
without exact transitive resolution are insufficient. No shared-source edits or
organization policy belong in this package. Consumer owners supply distinct
bindings/configurations and prove actual guarded paths separately. Roll back to
the previous reviewed artifact or disable restricted paths; never recover
availability by bypassing authorization or broadening credentials. Package
publication, deployment, grant changes and merge require separate human review.
