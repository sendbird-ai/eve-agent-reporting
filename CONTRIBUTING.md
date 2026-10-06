# Contributing

Read [AGENTS.md](AGENTS.md) and [the public package policy](docs/public-package-policy.md)
before making changes. These rules apply to both people and coding agents.

Use [the spec → tickets → develop → release workflow](docs/workflow.md).
The repository provides four harness-neutral `SKILL.md` entry points in
`.agents/skills/`: `eve-spec`, `eve-tickets`, `eve-develop`, and `eve-release`.
They do not grant access to a tracker, authorize publication, or install runtime
subagents. Use the caller's configured tools and preserve existing authorization.

## Issues, specs and reviews

Use [GitHub Issues](https://github.com/sendbird-ai/eve-agent-reporting/issues)
for package bugs, proposals and implementation status. Search existing issues and
pull requests first. A small fix can use its issue as the spec; substantial API
changes should link a public design in the issue or a reviewed `docs/` proposal.
You do not need access to a private tracker, document service, deployment or customer
account to contribute. Consumer adoption can be tracked privately by its owners.

Open a branch from the current `main` unless intentionally stacking on an open PR;
name that dependency and target its branch explicitly. Maintainers review merges
and releases. A draft PR is neither an approved release nor a consumer deployment.

Start with [the source and contract map](docs/source-map.md) for architecture,
schema ownership, safe validation and reference-maintenance rules.

For vulnerability reports, follow [SECURITY.md](SECURITY.md).

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
