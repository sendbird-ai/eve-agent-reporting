# Changelog

## Unreleased candidates

### Reporting 1.0.0

- Replace implicit destination/environment functions with an explicitly configured client.
- Preserve existing inbound/outbound/audience HTTP shapes through private consumer adapters.
- Bound credential retrieval and transport under a total deadline; isolate diagnostics and reject redirects.
- Require verified receiver idempotency before optional retries.
- Define versioned generic telemetry separately from messaging events; receiver implementation is required.

### Optional modules 0.1.0

- Developer extension with its own subagent, tools, instructions, skill, sandbox workspace adapter and enforced policy/evidence gates.
- Transport-neutral messaging/progress, quality evidence helpers and read-only fleet baseline comparison.
- Actual artifact packing/audit and installed consumer verification.

These are review candidates, not published versions or an approved fleet baseline. See the migration and release gate documents.
