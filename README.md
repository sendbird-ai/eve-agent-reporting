# eve-agent-reporting

A dependency-free TypeScript client for reporting Slack agent interactions, sent
messages, and audience participation to **your own reporting service**.

Works with any server-side Slack agent, including Eve agents. No Eve SDK,
Sendbird account, or company dashboard is required by the configurable client.
The event model is Slack-specific; this package does not collect events from
Slack or provide hosted storage, analytics, or a dashboard.

## Install

```sh
npm install @bshaan77/eve-agent-reporting
```

Requires Node.js 20+ and ES modules. The API below is introduced in **0.3.0**.
If that release is not yet published, build this checkout to try it.

## Configure your client

```ts
import { createReportingClient } from "@bshaan77/eve-agent-reporting/client";

const reporting = createReportingClient({
  baseUrl: "https://reports.example.com/api/agents",
  token: () => process.env.REPORTING_TOKEN,
  onError: ({ event, kind, status }) => {
    console.error("Reporting failed", { event, kind, status });
  },
});

await reporting.reportInboundEvent({
  slug: "support-assistant",
  slackUserId: "U123ABC",
  channelId: "C123ABC",
  sessionTurnKey: "1750000000.000001",
  messageCount: 1,
});
```

Your receiver gets a JSON POST at
`https://reports.example.com/api/agents/support-assistant/events`, authenticated
with your Bearer token. The collection URL is required. The new client never
reads environment variables implicitly or falls back to another organization's
server. Independent clients can use different destinations and credentials.

The `/client` entry point excludes the legacy adapter. The package root also
exports `createReportingClient`, alongside the old functions for compatibility.

## Outbound messages and audience

```ts
import { extractTaggedUserIds } from "@bshaan77/eve-agent-reporting/client";

await reporting.reportOutboundEvent({
  slug: "support-assistant",
  slackMessageTs: "1750000001.000001",
  channelId: "C123ABC",
  isThreadReply: true,
  sourceTool: "reactive-reply",
});

await reporting.reportAudienceEvidence({
  slug: "support-assistant",
  entries: [
    {
      slackUserId: "U123ABC",
      evidenceKind: "TRIGGERED",
      channelId: "C123ABC",
      sourceEventId: "1750000000.000001",
    },
  ],
});

const mentionedUsers = extractTaggedUserIds("Hello <@U123ABC>!");
```

Capture events inside your agent's Slack handlers. Use stable Slack message
timestamps or turn IDs so your receiver can deduplicate repeated deliveries.

## Configuration and delivery

| Option      | Behavior                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`   | Required HTTP(S) collection URL, including any path prefix. No credentials, query, or fragment.                                                |
| `token`     | Required string or synchronous provider. Providers run at each send, supporting token rotation. Empty/missing returned values disable sending. |
| `timeoutMs` | Request timeout, default 5000 ms. Custom fetch implementations must honor the abort signal.                                                    |
| `fetch`     | Optional fetch-compatible transport, useful for tests.                                                                                         |
| `onError`   | Optional callback for HTTP errors, request failures, timeouts, token-provider failures, and invalid slugs.                                     |

Invalid client configuration throws at construction. Reporting failures resolve
without failing the agent turn. Errors are silent unless you supply `onError`;
its metadata excludes credentials, event bodies, server responses, and raw errors.
Errors from that callback are swallowed. Redirects are rejected.

There is no automatic retry, queue, or delivery guarantee. Await sends, or pass
their promises to your host's background-task mechanism. Using `void` alone may
lose events when a serverless invocation ends. Empty audience batches are skipped.

## Bring your own receiver

Implement the [HTTP contract](docs/http-contract.md) in your service, using your
own authentication, storage, and reporting UI. The client preserves payloads; the
receiver validates them, authorizes the agent, and handles deduplication.

A [local example](examples/README.md) demonstrates sending all three event types
to a small Node.js receiver. It needs no company services and stores only
temporary in-memory counts.

## Existing installations

Top-level `reportInboundEvent`, `reportOutboundEvent`, and
`reportAudienceEvidence` preserve their v0.2 behavior. They are deprecated
compatibility exports and still use the original Automators destination and
`AUTOMATORS_MCP_TOKEN`. **New integrations should use the configured client.**

See the [migration guide](docs/migration.md) for explicit configuration without
changing existing event payloads or backend routes. Removing compatibility
exports is reserved for a future major release, after existing consumers migrate.

## Development

```sh
npm ci
npm run typecheck
npm test
npm pack --dry-run
```

Tests cover the configurable transport, legacy wire compatibility, and the local
receiver. CI runs on Node.js 20, 22, and 24.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
