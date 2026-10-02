# Contributing

Read [AGENTS.md](AGENTS.md) and [the public package policy](docs/public-package-policy.md)
before making changes. These rules apply to both people and coding agents.

## Pull request checklist

- [ ] The capability is useful to independent consumers without source edits.
- [ ] Examples, prompts, fixtures, comments, and change descriptions use neutral
      names and synthetic data.
- [ ] Tenant endpoints, agent identities, repository allowlists, connection
      references, ticket destinations, credentials, and organizational policies
      are provided by private caller configuration.
- [ ] Permission boundaries are enforced in code and cannot be widened by task
      input. Failure paths do not expose sensitive configuration or credentials.
- [ ] API changes, migration requirements, supported SDK/runtime versions, and
      optional dependencies are documented accurately.
- [ ] Validation appropriate to the change was run and its limits are stated.
- [ ] For releases, both repository content and the actual packed artifact were
      inspected for private content and configuration defaults.

## Validation

For TypeScript changes, install with `npm ci`, then run `npm run typecheck` and
`npm run build`. Run the applicable test and compatibility suites when they are
available. Documentation changes require link and content review, not invented
runtime test claims.

Before a release, inspect the files listed by `npm pack --dry-run --json` and the
contents of the packed artifact. Generated code, declarations, source maps, and
included documentation are part of the public surface.

The current implementation contains migration debt. The policy requires its
removal before the next release; it does not claim that an automated neutrality
check or complete compatibility suite already exists.
