---
name: eve-develop
description: Implement a scoped agent-component ticket with relevant evidence and prepare an owner-reviewed draft pull request.
---

Read the repository's `AGENTS.md`, requested ticket/spec, and Develop section of
[the contributor workflow](../../../docs/workflow.md).

Refresh the configured base and check for existing edits before implementation.
Resolve contract prerequisites or identify their blocker. Inspect installed SDK
docs for runtime API changes. Keep trusted policy separate from task input and
tenant wiring outside public components.

Implement a coherent ticket slice and run the repository's applicable checks. Report
what actually ran, whether evidence covers the changed behavior, and any evaluation
gap. Distinguish measured coverage from heuristics and assertion failure from setup
failure. Restore temporary evidence changes; stop if restoration fails.

Review the final diff for scope, credentials/private content, API changes and migration
requirements. Prepare the PR body with ticket/spec references and validation limits.
Open a draft PR if authorized; leave merge/release to the configured process. Do not
modify other consumers merely because their repositories are accessible.
