# Developer component

An optional Eve 0.66.2 extension contributing a scoped developer subagent. Node 24 is the first supported workspace/pilot target. This 0.1.0 candidate is not published or production-certified.

```ts
// agent/extensions/development.ts — private application configuration
import developer from '@bshaan77/eve-agent-developer';
import { bindings } from '../../src/developer-bindings.js';

export default developer({
  policy: {
    repositories: [{
      repository: 'example-org/example-repo',
      baseBranch: 'main',
      branchPrefix: 'assistant/',
      readablePaths: ['.'],
      writablePaths: ['src', 'test'],
      protectedPaths: ['src/generated', '.github/workflows'],
      checks: ['typecheck', 'test'],
    }],
    developerModel: 'openai/gpt-5.4',
    developerModelFamily: 'openai',
    reviewModel: 'your-configured-review-model',
    requireIndependentReview: true,
    ticketDestination: 'configured-project',
    maxFileBytes: 100000,
  },
  bindings,
});
```

The mount exposes `development__developer`. Its tools initialize a repository, read/list/edit/write scoped files, create or reuse an audit ticket, run checks, review the authoritative diff and publish a draft. Optional framework tools are disabled. The component exposes no merge, deployment or arbitrary-shell action.

## Host bindings

`bindings` contains a `host` implementing the exported `DeveloperHost` interface (`/core`). These are runtime bindings; do not serialize credentials into JSON or model-visible configuration.

The packaged subagent owns a Vercel sandbox (2 vCPUs, deny-all egress). Eve compiles this environment before runtime config is bound, so the provider is not supplied via a mount callback. Tools pass the active sandbox as the fifth `workspace` argument. Other providers need a consumer-authored sandbox override and separate tests; they are not certified by this candidate.

The host owns:

- Durable, atomically bound run records and a shared per-repository lease store. `saveRun` must never rebind a run identity to another repository. Lease ownership must be checked after asynchronous operations.
- Clone/reopen lifecycle and base commit, authenticated repository access, commit identity and constrained check commands.
- Canonical file operations. The `/sandbox` export provides `createSandboxWorkspace` for Eve sandbox sessions, real-path validation, full git/untracked diff capture, repository instructions and skill discovery. Bind trusted absolute Node/git executables and check-result parsers.
- Credential injection outside the sandbox process; closed default egress and revocation in `finally`. No authenticated connection is exposed to the model. Check commands must run without publication credentials and within a disposable provider boundary.
- Idempotent tracker creation by run identity and private destination.
- Reviewer model/provider provenance and fallback evidence. The engine rejects same-family fallback when independence is required.
- Draft-only publication keyed by run identity. Validate the live lease fence and exact authoritative fingerprint at the actual push/PR boundary. Refuse changed workspaces or stale fences. Do not trust a task-supplied patch, head, check result or approval.

A synthetic host exercises contracts in tests. It is not a production distributed lock, GitHub integration or provider sandbox certification. Missing production bindings are blockers; there is no permissive fallback. The `/github` export supplies `createGitHubHost` for shared clone, configured checks, staged-content/commit verification, explicit-SHA push and idempotent draft publication. Private services bind scoped firewall credentials, durable records/leases/fence checks, tracker, reviewer and GitHub draft API calls. Private adapters still need implementation and live validation.

## Evidence limits

Configured checks produce structured evidence and artifact references rather than raw logs. Check adapters classify setup failures and assertions; they must not label any nonzero exit as an assertion failure. Use the quality module's restoration workflow for red/green proof; no untrusted command string is accepted by developer tools. Measured coverage and prompt behavior evaluations require consumer test harnesses. The package does not infer them from source references.

Edits invalidate prior evidence. Checks/review/publication inspect the complete diff, reject symlinks and forbidden paths, and bind results to its fingerprint. Research mode is read-only. Publication produces a human-reviewable draft and never authorizes merge or deployment.

## Shared GitHub adapter

Construct `createGitHubHost({ services, nodeExecutable, gitExecutable, commitIdentity, checks })` in private application code and mount `{ bindings: { host } }`. Check commands/parsers are selected by configured repository, never supplied by task text.

The adapter closes network access in `finally`, commits without hooks/signing, checks the prepared commit's ancestry and exact content, pushes the reviewed commit SHA without force, and recovers a matching draft by hashed run key plus commit. Services must enforce live lease ownership, renew leases through asynchronous operations, stop/reap check subprocesses before later file operations, and make external publication idempotent. The shared adapter is not a distributed-store implementation. Sandbox isolation must exclude mounted host secrets and other consumers' workspaces.

Local git/filesystem tests exercise this sequence with simulated network and draft APIs. They do not certify live Vercel credentials, GitHub access or cross-service atomicity.
