---
name: eve-release
description: Prepare and verify an agent-component release, including packed-artifact audit, migration evidence and authorized publication.
---

Read the repository's `AGENTS.md`, public package policy and Release section of
[the contributor workflow](../../../docs/workflow.md).

Inspect the actual manifest and release setup. Choose the version from approved
contracts, including explicit handling of breaking changes. Prepare migration and
rollback notes before publication. Do not assume an unpublished version is available.

Build and pack the candidate. Inspect the actual tarball and installed consumer
examples, not only a dry-run file list. Verify declared runtime/SDK configurations,
optional dependencies, prompt discovery and two differently configured consumers.
Run available public-content checks and record remaining automation/manual-review gaps.

Resolve required checks through authorized maintainers. Stage concrete release notes,
source commit, artifact checksums, validation and known issues for review. Publish only
when authorized; existing publication authorization need not be requested again.
Record the result and keep package publication separate from consumer deployment.
If a gate fails, leave a reviewable candidate and report the exact blocker.
