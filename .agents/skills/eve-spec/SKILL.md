---
name: eve-spec
description: Write or revise a technical spec for a reusable agent component or its adoption, grounded in source and installed SDK evidence.
---

Read the repository's `AGENTS.md` and the Spec section of
[the contributor workflow](../../../docs/workflow.md).

Inspect the requested capability and affected consumers. Record the inspected source
revision and installed SDK versions. Separate facts from proposals; expose decisions
that block implementation instead of choosing an unverified API.

Specify the public interface, caller configuration, permission boundaries, failure
behavior, compatibility/migration, verification cases and ordered work slices. Keep
public examples synthetic. Put private deployment wiring only in the configured
private destination.

Use an existing issue for a small scoped fix. For substantial work, create or update
the configured spec artifact when authorized; otherwise leave a local reviewable
draft. End with links/paths, unresolved decisions and what is ready for ticketing.
