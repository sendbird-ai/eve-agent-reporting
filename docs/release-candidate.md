# Candidate release gates

This branch prepares reporting 1.0.0 and optional modules 0.1.0. No publication or deployment is performed by development commands.

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

The development candidate passes reporting/component typechecks and 51 focused tests on Node 24.21.0; reporting/messaging/quality/fleet runtime suites also pass on Node 20.20.2 (33 tests). The developer authoring build uses Eve 0.66.2. Two differently configured consumers install the actual tarball and compile subagent/tools/instructions/config callbacks with `--skip-sandbox-prewarm`. Reporting installs without Eve. Cloud snapshot preparation requires separate provider access and remains unverified; the skipped build is not deployable certification.

The source and all five unpacked artifacts pass a privately supplied identifier audit with one exact reviewed repository-provenance exception, plus generic credential-pattern checks. Private adapter and receiver checks are recorded in the consumer's spec space. Full model behavior evaluations and live host/pilot validation remain release/adoption gates.
