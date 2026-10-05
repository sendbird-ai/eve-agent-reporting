# Reporting HTTP contract

The caller supplies an absolute HTTP(S) collection URL and a string or asynchronous credential provider. URL credentials, query strings and fragments are rejected. HTTPS is recommended outside local tests. No endpoint, agent identity or environment variable is chosen by the library.

Requests POST JSON with `Authorization: Bearer <token>` and `Content-Type: application/json`. Redirects are rejected. The agent slug is removed from the body and used as a single validated path segment.

| Method | Path relative to collection | Stable receiver key |
| --- | --- | --- |
| `reportInboundEvent` | `/{slug}/events` | Agent identity + `sessionTurnKey` |
| `reportOutboundEvent` | `/{slug}/outbound-events` | Agent identity + real `slackMessageTs` |
| `reportAudienceEvidence` | `/{slug}/audience-evidence` | Agent identity + user + evidence kind + `sourceEventId` |
| `reportTelemetryEvent` | `/{slug}/telemetry-events` | Agent identity + `eventId` |

Inbound, outbound and audience payload fields retain the existing wire shape. Empty audience batches are skipped. Generic telemetry has `schemaVersion: 1`, `eventId`, `occurredAt` (timestamp), `kind`, `source` and optional scalar `attributes`. It uses no fabricated messaging identifiers. **Receivers must implement authentication, persistence, idempotency and querying for this new route before adoption.** A client method alone does not establish receiver support.

## Delivery

Each call has one total deadline (default 5000ms; configurable 1..60000ms) covering token retrieval, retries and transport. Fetch receives an abort signal; a race bounds completion even if a custom transport ignores cancellation. This cannot terminate a non-cooperative provider's underlying work. Synchronous blocking code cannot be interrupted by a JavaScript timer.

No retry occurs by default. `maxRetries` (0..3) requires `receiverIdempotent: true`, which is a caller assertion backed by receiver tests. Retryable failures are transport errors, 429, 502, 503 and 504. All attempts preserve the identical payload/key. There is no client-side exactly-once guarantee: a response lost after persistence can cause a retry. The receiver must scope authorization and duplicate keys to the authenticated agent. Distinct events must keep distinct keys.

Delivery methods resolve without throwing on payload, credential, HTTP or transport failure. Invalid client configuration throws at construction. Failures emit metadata only: event category, failure kind, attempts and optional HTTP status. No payloads, credentials, endpoint, slug, raw exceptions or response bodies are included. Missing credentials are explicitly diagnosed. Callback errors are isolated; callback promises are not awaited. Callbacks should be synchronous and brief.

Await the call or register it with the host's completion/lifetime facility. Unregistered fire-and-forget calls can be lost during host teardown. This client has no persistent queue, background worker or flush method.
