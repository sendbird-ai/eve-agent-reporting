# Reporting 1.0 migration

This is an unpublished breaking candidate. Do not change live consumers to a version that is not available.

The root no longer exports implicit `reportInboundEvent`, `reportOutboundEvent` or `reportAudienceEvidence` functions. It exports `createReportingClient`, types and the pure `extractTaggedUserIds` helper. Organization endpoints, environment reads and compatibility wrappers belong in private consumer code.

1. Keep the previous package lock and private configuration for rollback.
2. Construct a configured client in a private adapter, reading that application's existing destination and credentials there.
3. Re-export the three bound client methods from the adapter to preserve application call sites. Import the factory from the package root; there is no `/client` entry point.
4. Preserve existing agent registrations and the inbound/outbound/audience identity keys. The JSON field names and routes remain the same.
5. Compare adapter requests against the real receiver schemas/authentication and replay duplicate synthetic events. Verify all reactive, tool and scheduled capture paths.
6. Verify hosted completion and persisted dashboard attribution before owner-reviewed deployment. An HTTP capture fixture is not production persistence evidence.
7. Roll back the package lock, adapter and deployment revision if attribution, counts or completion regress.

Generic telemetry uses a separate versioned route and requires new receiver persistence/query support. Do not route it into messaging tables with invented user/channel IDs.

Current-tree cleanup does not erase historical commits or published versions. Assess historical artifacts separately and report actual sensitive exposure privately. Do not rewrite history or claim credential rotation without evidence.
