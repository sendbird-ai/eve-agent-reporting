# Public package policy

## Purpose and scope

Independent teams must be able to use these components by supplying configuration,
without inheriting the original deployment's vocabulary, credentials, or policies.
This policy covers source, prompts, tests, fixtures, examples, documentation,
generated artifacts, CI configuration, and public issue and pull request text.

## Public components and private integration

| Public capability | Private caller configuration |
| --- | --- |
| Reporting contracts, transport, bounded delivery, deduplication support, safe diagnostics | Receiver URL, authentication provider, agent identity, receiver persistence |
| Developer workflow, repository tools, sandbox adapter, evidence and draft PR creation | Allowed repositories and paths, base branches, authentication connections, ticket project, reviewers, limits |
| Messaging formatting, progress events, status and reporting hooks | Connector, identity, routing and dispatch policy |
| Schema checks, evaluation harness and compatibility tests | Business acceptance criteria and private evaluation data |
| Baseline manifest, capability inventory and adoption checks | Fleet membership, owners, deployment projects and installed versions |

Keep reporting independently usable. Other capabilities may share a repository
but should have explicit module boundaries and independent releases where their
compatibility needs differ. Do not require every consumer to install every tool
or provider. Project-specific workflows remain private plugins or adapters.

## Content rules

1. Do not embed company or internal bot names, private service URLs, real project
   identifiers, production examples, internal onboarding instructions, or
   tenant-specific environment variable names.
2. Use synthetic identities and reserved example domains. A vendor's documented
   public integration API may be named accurately; a particular customer's
   connection, domain, account, or policy may not.
3. Require explicit configuration for destinations and identity. There must be no
   implicit fallback to a tenant's service, repository, ticket project, or bot.
4. Keep credentials in external providers or trusted runtime bindings. Do not
   put them in model-visible text or return them through tool results. Diagnostics
   must not include request bodies, authentication headers, or raw provider errors
   that can expose sensitive data.
5. Preserve required copyright/license attribution and accurate package ownership
   and source links. These narrowly scoped provenance fields do not permit
   organization-specific runtime behavior, prompts, fixtures, or documentation.

## Reusable subagents

Package the full execution capability: instructions, tools, sandbox lifecycle,
policy validation, and tests. Separate three inputs:

- **Component behavior:** versioned, public workflow and implementation.
- **Trusted configuration:** repositories, paths, branches, credentials, ticket
  routing, model/reviewer selection, concurrency and cost limits.
- **Task request:** requested change, issue reference, and acceptance criteria.

Validate configuration at initialization. Task requests and repository content
must not override trusted permission policy. Enforce repository/path boundaries,
protected operations, and concurrency limits in code. Preserve a human review
gate for draft PRs; do not add a generic self-merge or production deployment path.

Verify the installed SDK's extension and subagent discovery behavior. If generated
prompt files are necessary, generate them deterministically from the packaged
source and check their provenance/hash. Do not assume symlinks or nested extension
mounting work across supported SDK versions.

## Compatibility and adoption

Publish explicit contracts and supported runtime/SDK versions. Prove the component
works in at least two independent configurations before calling it reusable.
Public fixtures must be generic; real deployment configuration stays private.

Existing tenant-specific wrappers must move into private consumers. Prepare and
validate adapters before removing exported contracts or changing wire formats.
Use an explicit breaking-version plan for incompatible changes. Existing deployed
versions continue operating until their owners choose a tested upgrade.

## Release gate

Before publishing a new version:

- Audit all public content and the actual package tarball, including generated
  code, declarations, source maps, templates, and bundled instructions.
- Add automated checks for tenant identifiers and secret patterns, with narrowly
  reviewed provenance/vendor exceptions. Automated scanning supplements manual
  review; it does not establish complete privacy or generic behavior by itself.
- Verify required configuration has no tenant fallback and invalid configuration
  fails safely. Verify credentials are not exposed in normal or failure output.
- Run build, type/schema checks, meaningful tests, and the declared compatibility
  matrix against installed artifacts. Run behavioral evaluations when prompts
  or tool behavior change.
- Provide migration guidance and rollback steps. Deployment owners review each
  consumer's evidence before adoption.

Adding this policy does not make existing source or releases compliant. A release
with unresolved tenant-specific content must not be presented as meeting this
policy. Removing content from the current tree also does not erase historical
commits or already published artifacts; handle any actual sensitive exposure
separately, including credential rotation when required.
