# Repository rules

This is a public repository for reusable agent components. Apply these rules to
code, prompts, tests, examples, documentation, generated files, and public change
descriptions.

## Public content

- Do not introduce company names, internal bot names, customer information,
  private endpoints, deployment identifiers, connection references, ticket
  project identifiers, or tenant-specific environment variables.
- Use neutral examples such as `example.com`, `example-org/example-repo`, and
  `support-assistant`. Never copy production payloads or logs into fixtures.
- Supply agent identity, repository scope, branches, destinations, credentials,
  ticket routing, reviewers, and operational limits through trusted caller
  configuration. Do not add defaults that contact a particular organization.
- Keep organization policy and compatibility adapters in private consumers.
  A task's text must not be able to widen a configured permission boundary.
- Never expose credentials in prompts, tool results, errors, logs, or examples.
- Preserve legally required attribution and accurate repository/package metadata.
  Such metadata is not an exception for tenant-specific behavior or examples.

## Component boundaries

- Keep reporting independent of an agent SDK. Larger capabilities belong in
  optional, separately versioned modules rather than mandatory reporting imports.
- A reusable developer component includes its tools, sandbox integration,
  instructions, and validation. Copying a prompt alone is not adoption.
- Enforce permissions in code. Human review is required before merge or deployment
  unless a consumer explicitly supplies a narrower, reviewed automation policy.
- Inspect documentation for the installed SDK version before changing its APIs.
  Verify packaging and prompt discovery using actual installed artifacts.

## Change and release review

- Follow [the public package policy](docs/public-package-policy.md) and
  [the contribution checklist](CONTRIBUTING.md).
- Existing tenant-specific content is migration debt, not a precedent. The next
  release must complete the neutrality audit; adding these rules does not certify
  the current implementation as compliant.
- Do not silently change deployed consumers. Make breaking contracts explicit,
  choose a compatible versioning strategy, and prepare private adapters first.
- Report executed validation separately from proposed checks. Do not describe
  file-reference heuristics as measured coverage or unrelated command failures
  as proof of a failing assertion.
