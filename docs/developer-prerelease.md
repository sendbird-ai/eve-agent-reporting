# Developer prerelease candidate

This change isolates the optional developer component version as `0.1.0-rc.1`.
It does not approve or publish the root reporting 1.0.0 breaking change. The intended
release selects only `@bshaan77/eve-agent-developer` and the `next` distribution tag.
Human review of this candidate and its parent branch is required before publication.

## Runtime and exports

Exact supported baseline: Eve 0.66.2 and Node 24. Exports are the extension root,
`/core`, `/tools`, `/sandbox` and `/github`. The packed extension includes its
subagent, scoped tools, sandbox environment, instructions and development skill.
Use the component README for the trusted host contract. Missing durable leases,
run records, scoped firewall authorization, ticket routing, independent reviewer
and draft publisher remain consumer enablement blockers. No synthetic binding
may be substituted for production services.

## Executed validation

Node 24.21.0: `npm ci --ignore-scripts`, `npm run check:all`, developer component
build and 21 focused tests passed. Tests exercise actual local git/filesystem
workflow and synthetic publication, denied paths/renames/symlinks, stale review,
lease fencing, credential revocation and independent reviewer requirements.
`npm run pack:candidates` inspected six packed artifacts with zero configured
baseline findings. A separate private configured denylist audit of all 42
developer artifact files also returned zero findings; manual review remains
required. `npm run smoke:installed` compiled two independent installed developer
consumer configurations. Sandbox prewarm was skipped; no live provider, tracker,
GitHub credential or external publication exercise occurred. A local Git push
verified that annotated tags and repository configuration cannot broaden the
reviewed branch publication. Context scope/size/symlink/nested-rule regressions
cover initialization as well as ordinary reads.

The developer tarball contains neutral configuration examples and no consumer
repository policy or connection configuration. Source and generated content still
require human privacy review before publishing. Tarball checksums belong to the
actual final packed artifact, not a future build.

## Release and rollback

After approval, repack the final reviewed commit, repeat checks and packed audit,
and publish only the developer tarball with `--tag next --access public`. Never
publish all workspaces or the root package for this prerelease. Record source
commit, artifact SHA256 and registry integrity. Consumers install the exact
prerelease only in their separate owner-reviewed adoption PRs. Publication does
not enable a consumer. Disable an adopted extension and revert its adoption PR to
roll back; retain the old package release and consumer lockfile. Do not delete or
replace an already published package version.
