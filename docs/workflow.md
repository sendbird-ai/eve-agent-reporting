# Contributor workflow

## Configuration and authority

The workflow is **spec → tickets → develop → release**. A small, clearly scoped
fix can use its existing issue/PR as the spec; do not create four artifacts for a
one-line change. An existing approved spec or ticket can start at its current stage.

For this package, GitHub Issues is the authoritative public implementation tracker.
Keep public designs in an issue or repository documentation, and link the owning
issue from each PR. No private tracker or document service is required. Consumer
adoption has its own private tracking and must not duplicate upstream status.

The host supplies repository/base branch, reviewers, supported runtime versions
and release method. Obtain these from trusted project configuration or explicit
user instructions. Never put tenant routing or
connection identifiers into public skills or examples. If a destination is absent,
prepare a local reviewable draft rather than guessing where to publish it.

Skills guide work; they are not an authorization grant or a security boundary.
Continue actions already authorized in the session. Stage a concrete release before
requesting any missing release permission; do not infer publish, merge, deploy or
fleet-wide access from an instruction to develop a component.

## Spec

Read relevant source and the installed SDK documentation first. Record:

- The concrete problem, desired behavior and affected paths/source revision.
- Inspected facts separately from proposed design and unresolved decisions.
- Public API/configuration shape, trusted policy versus task input, and errors.
- Dependencies, optional modules, supported versions and installed-file discovery.
- Compatibility, breaking-version decision, private adapter and rollback plan.
- Meaningful verification scenarios, public-content checks and acceptance criteria.
- Non-goals, linked issues and the smallest ordered implementation steps.

Use generic public examples. Private fleet notes and company wiring belong in the
consumer's own spec space. Do not copy internal specs into a public PR description.

## Tickets

Create implementation slices with independently reviewable outcomes. Each ticket
needs affected paths, approach, dependencies, acceptance/verification, compatibility
impact and a spec link. Distinguish development, adoption and maintenance work.
Search for existing work before filing. Reuse or link relevant issues; do not reopen
completed historic work as if it were a new blocker.

Create real tracker dependency relations after identifiers are known. Keep dates,
estimates, cycles and assignees unset unless supplied or agreed. Work with unresolved
contracts remains in backlog and names the decision that unlocks implementation.
Use GitHub issue dependencies or explicit dependency links; specs link to the
authoritative issues. A private tracker relation is not a prerequisite.

## Develop

Read the issue/spec and repository instructions on current base. Implement one
coherent slice, preserving permission boundaries and compatibility. Use the target
repository's actual validation commands; do not invent a common command across SDKs.

Run checks relevant to changed behavior. Prompt changes need applicable behavior
evaluations or a stated evaluation gap. A green unrelated suite is not evidence that
a change works. Restore temporary working-tree changes after evidence collection;
stop and report if restoration fails. Never label setup errors as failing assertions
or source references as measured coverage.

Before opening a PR, review the complete diff for unintended changes, public-content
violations, configuration leakage and required migration work. Include the spec/issue
link, behavior change, executed checks, limits and remaining blockers. Create a draft
PR when authorized; preserve the repository's human merge/release process.

## Release

Read the actual package manifest, CI/release configuration and supported versions.
Prepare versioned release notes and migration/rollback guidance. Verify the installed
candidate, its dependency boundaries and the declared runtime/SDK matrix.

Build and inspect the real packed artifact, including declarations, maps, prompts,
templates and docs. Run the neutrality/secret checks that exist, and state any missing
automation or manual-review gaps. No tenant defaults may remain in the next clean
release. Verify two independent consumer configurations before claiming a capability
is reusable. A publication is not a consumer rollout.

Resolve required checks legitimately. Record release approval, version, source commit,
artifact checksums, executed validation and publication outcome. Publish only within
the user's authorization. Consumer owners adopt exact approved versions separately,
with deployed verification and a previous-version rollback record.

## Skills and runtime packaging

The four contributor skills live in `.agents/skills/` and each links to this workflow.
Hosts can load their `SKILL.md` content through their supported discovery mechanism.
They are not currently registered as runtime tools or bundled as an Eve extension.
Test discovery against installed SDK artifacts before integrating them into a runtime
subagent; add deterministic generation/provenance checks if copying is necessary.
