# Reusable agent components

A configurable reporting client and optional developer, messaging, quality and fleet packages. Applications supply identity, destinations, credentials, repository scope, ticket routing and deployment policy. The public packages contain no organization defaults.

## Reporting

The root package is independent of Eve and has no runtime dependencies. This branch prepares **1.0.0**; it has not been published. Existing installations remain on their installed version until explicitly upgraded.

```ts
import { createReportingClient } from "@bshaan77/eve-agent-reporting";

const reporting = createReportingClient({
  baseUrl: "https://reports.example.com/api/agents",
  token: () => process.env.REPORTING_TOKEN,
  onError: failure => console.warn("Reporting delivery failed", failure),
});

// Await completion or register it with the host's supported lifetime mechanism.
await reporting.reportInboundEvent({
  slug: "support-assistant",
  slackUserId: "U123ABC",
  channelId: "C123ABC",
  sessionTurnKey: "session:turn-1",
  messageCount: 1,
});
```

The client captures no runtime events itself. Call it after real inbound completions, outbound sends or audience observations. See the [HTTP contract](docs/http-contract.md) for bounded delivery, retry/idempotency rules and generic telemetry receiver requirements.

## Optional packages

| Package | Provides | Application supplies |
| --- | --- | --- |
| `@bshaan77/eve-agent-developer` | Eve extension, subagent, scoped tools, sandbox workspace adapter, checks/review/draft flow | Trusted repository policy, sandbox environment, durable run/lease store, tracker, reviewer and draft publisher |
| `@bshaan77/eve-agent-messaging` | Ordered progress, optional Slack rendering, send observation | Transport, real identifiers, business voice and durable delivery when required |
| `@bshaan77/eve-agent-quality` | Check classification, red/green restoration flow, redacted content audit | Trusted test adapters, behavior evaluations and private audit identifiers |
| `@bshaan77/eve-agent-fleet` | Versioned baselines and read-only adoption differences | Private inventory, resolved locks and deployment evidence |

Optional packages are separately versioned 0.1.0 candidates. Reporting never imports them. The developer extension currently targets Eve **0.66.2** and Node **24**; older SDKs need separate migration and verification. Package existence does not establish production readiness.

See [architecture](docs/architecture.md), [migration](docs/migration.md), each package README and [release gates](docs/release-candidate.md).

## Develop

```sh
npm ci
npm run check:all
npm run pack:candidates
```

Use Node 24 for the workspace. Reporting alone supports Node 20 or later. Packed-artifact smoke checks use synthetic adapters, never production credentials or real ticket/PR writes.

## Contribute

Read [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md) and the [spec → tickets → develop → release workflow](docs/workflow.md). Contributor skills in `.agents/skills/` are separate from the runtime developer skill. Follow [SECURITY.md](SECURITY.md) for private vulnerability reports.
