# Candidate release gates

Reporting 1.0.0 and the other optional modules 0.1.0 remain unpublished candidates. Slack 0.1.0-rc.1 is a published pilot prerelease; stable Slack 0.1.0 has not been released. Development commands do not publish or deploy, and publication does not approve consumer adoption.

Required before release:

- Maintainer review of the breaking reporting API and each optional package name/version.
- Build, types, relevant tests and actual tarball inspection. Verify reporting alone without Eve and two differently configured installed developer consumers on Node 24/Eve 0.66.2.
- Private adapter parity against the receiver; authenticated persistence and dashboard attribution for pilots.
- Production host integration: sandbox lifecycle/network revocation, durable lease fencing, cold-start/idempotent recovery, tracker and draft publisher; a mock cannot certify these services.
- Prompt/tool behavior evaluations using consumer acceptance criteria, including domain-specific constraints left out of the public package.
- Two owner-reviewed live consumer exercises with deployment/rollback evidence before a fleet baseline is approved.
- Required repository checks resolved through the authorized maintainer process. No bypass.
- Source and unpacked-artifact scan with privately supplied identifiers plus manual review. Default generic secret scanning does not know private identifiers.
- Historical artifacts/history exposure reviewed separately.

`npm run pack:candidates` creates actual tarballs and a checksum manifest without publishing. Set `PUBLIC_AUDIT_CONFIG` to a private JSON file containing `forbiddenTerms` and exact reviewed `metadataAllowlist` entries. Provenance exceptions are limited to specific package metadata fields; no source or prompt may be broadly exempted. Keep this file outside the public repository.

Evidence reports must distinguish executed checks, unsupported runtime/SDK versions, mock exercises and live provider results. Passing schema or fixture checks is not a successful production rollout.

## Executed candidate checks

The development candidate passes reporting/component typechecks and 52 focused tests on Node 24.21.0; reporting/messaging/quality/fleet runtime suites also pass on Node 20.20.2 (33 tests). The developer authoring build uses Eve 0.66.2. Two differently configured consumers install the actual tarball and compile subagent/tools/instructions/config callbacks with `--skip-sandbox-prewarm`. Reporting installs without Eve. Cloud snapshot preparation requires separate provider access and remains unverified; the skipped build is not deployable certification.

The source and all five unpacked artifacts pass a privately supplied identifier audit with one exact reviewed repository-provenance exception, plus generic credential-pattern checks. Private adapter and receiver checks are recorded in the consumer's spec space. Full model behavior evaluations and live host/pilot validation remain release/adoption gates.

## Slack component prerelease

`@bshaan77/eve-agent-slack@0.1.0-rc.1` is published. The successful Publish workflow run `38648454656` used source `812bcb42f007b8af07bdfcdc6ee30b3e540171d4`, tagged `slack-v0.1.0-rc.1`. The downloaded registry tarball was verified against the release artifact:

```text
SHA-256 549038dfabe870031098e7ceae4fdd307ccd30fe67ab9d3727617a04c4202705
```

The optional Slack component is independently versioned. Its 31 deterministic
tests pass on Node 20.20.2 and 24.21.0. Actual installed tarballs were exercised in two
independently configured consumers using Eve 0.23.0 and 0.66.2. Both typecheck and
build; compiled manifests verify that root and specialist instructions contain the
packaged prompt. These are synthetic fixtures, not deployed agents or model evaluations.
Source and unpacked-artifact checks include a private identifier denylist and the
existing credential-pattern audit. Repeat release checks against the approved commit.

Run `npm run smoke:slack` after packing. It checks artifact integrity and writes
`.artifacts/slack-installed-smoke.json`. Native table blocks, live Slack read scopes,
transport deadlines, private host permissions, model answer quality and rendered
Slack responses remain adoption gates. This prerelease publication does not release the other package candidates, establish a stable Slack release or authorize a consumer rollout.
