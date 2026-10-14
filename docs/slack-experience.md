# Shared Slack experience candidate

Tracks issue #8 and stacks on the optional-component baseline in PR #3.

## Problem and design

Sender attribution is not audience awareness. A follow-up to a scheduled card may
lose its parent or period when dispatched into a new agent session. Specialists
need an explicit briefing contract, and copying formatting instructions does not
enforce transport behavior.

Add `packages/slack` as a separate optional module, independent of reporting,
existing progress utilities and any SDK. Credentials, workspace identity, roles,
voice, destinations, disclosure decisions and send permissions remain private host
configuration. No permissions can be widened by a task or channel profile.

The source map is `packages/slack/src/{audience,context,render}.ts`; exported TypeScript
interfaces define the contracts. `packages/slack/prompts/slack.md` is packaged guidance,
not an automatically installed agent. The example adapter maps existing Eve context
and auth to those contracts without adding a dependency on Eve to the package.

## Acceptance and validation

- Complete known private audiences may receive technical detail; all other results
  stay plain. Exact person resolution never guesses names or emits raw errors.
- Keep the parent/card content and newest replies within a bounded context. Preserve
  supplied period wording, exclude trigger/future messages and flag incomplete data.
- Preserve code spans/fences. Structured replies retain all sources and caveats,
  escape untrusted Slack control markup and explicitly report overflow.
- Package source, declarations, prompts and tarball must pass public-content audit.
- Install the actual tarball in two independently configured consumers. Verify the
  example adapter against Eve 0.23.0 and 0.66.2; do not infer live interoperability.
- Model evaluations and real rendered-message tests are consumer rollout gates,
  not results established by deterministic unit tests.

## Release and adoption

This additive module begins at pilot prerelease 0.1.0-rc.1. Existing package APIs and installations
are unchanged. Release only after the baseline and this PR pass review, artifact
inspection and declared checks. Consumers pin exact approved versions, regenerate
and hash-check their prompt files, connect their existing read credentials, and
review local prompt conflicts. Roll back the package lock and adapter together.

The first slice does not migrate consumers, reproduce every existing bot behavior,
render native tables, or guarantee exactly-once delivery. Scheduled cards, domain
specific escalation rules and artifact publishing need their own host adapters and
behavior tests. Future versions should extend this common contract rather than
copying it into each consumer.
