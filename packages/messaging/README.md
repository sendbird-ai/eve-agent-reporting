# Messaging utilities

Transport-neutral, SDK-independent progress events, an optional Slack renderer and an observer for successful host sends. No Slack client, business voice, channel routing or primary-message dispatcher is included.

`createProgressRelay({ publish, maxTasks })` serializes events per task, requires `started` first, ignores stale/duplicate sequences and stops after completion/failure/cancellation. Publisher failures keep the same event retryable. Capacity is bounded; completed records may be evicted. Deduplication is in-process and is lost on restart/eviction. For cross-instance ordering or delivery, supply a durable host integration; this helper does not guarantee exactly-once messaging.

`renderSlackProgress(event)` escapes untrusted text and preserves an optional thread. `createSendObserver(report, maxEntries)` observes real sends from reactive, tool and scheduled paths without sending the primary message. Its reporting errors reject so the caller can diagnose/retry; isolate them at the host boundary if reporting must never fail a turn. Attach it only after a successful send and retain receiver idempotency.

Do not pass secrets, tool arguments or production payloads as progress text. Consumer prompt/dispatch behavior still needs evaluations; string renderer tests are not those evaluations.
