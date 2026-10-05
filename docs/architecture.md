# Optional components and trusted boundaries

One npm workspace keeps reporting at the root and independently versioned optional packages under `packages/`. Reporting has no Eve or connector dependency. Optional modules can be installed separately; a new Eve release is not an automatic fleet upgrade.

Trusted application configuration owns identity, endpoint, repository allowlists, readable/writable/protected paths, base branch, branch prefix, tracker destination, model selection and operational limits. Task input selects work within that policy. Repository prose provides context and cannot modify authority.

The developer is an Eve extension contributing a declared subagent, instructions, tools, skill and its own Vercel sandbox (2 vCPUs, deny-all). The authoring SDK is pinned to 0.66.2. Public bindings are runtime functions supplied at the application mount; they are not JSON configuration or credentials copied into prompts. Installed consumer builds verify packaging and mounting. A live provider exercise is separately required.

The shared engine does not expose arbitrary shell, merge, deployment or a general GitHub connection to the model. Only configured check commands execute in the sandbox. Edit tools canonicalize paths; checks and publication independently inspect the full outgoing diff. The host must keep credentials outside the sandbox process and restrict network access around authenticated operations, restoring closed access in `finally`.

Durable run storage, per-repository leases, fencing and idempotent ticket/PR publication are mandatory host contracts. No in-memory production fallback is supplied. Cold-start and concurrent-instance tests use a shared synthetic store; a production adapter requires its own distributed-storage and stale-fence tests. A PR quota is not a lock.

Messaging utilities compose with the caller's existing dispatch. Local ordering/deduplication is bounded and loses state on restart; durable messaging guarantees require host storage and receiver idempotency. Fleet comparison is read-only and distinguishes source, installed and deployed evidence.
