# Migrating existing callers

Version 0.3 adds a configured client while retaining every existing top-level
export and payload type. The legacy adapter retains its original destination,
call-time token lookup, empty-token no-op, and request behavior. Existing agents
can upgrade without changing their imports. HTTP status handling and timeouts
are improvements in the configured client only.

## Move organization configuration into your app

For an existing Automators integration, add a local `reporting.ts`:

```ts
import { createReportingClient } from "@bshaan77/eve-agent-reporting/client";

export const { reportInboundEvent, reportOutboundEvent, reportAudienceEvidence } =
  createReportingClient({
    baseUrl: "https://automators.sdix.io/api/eve-agents",
    token: () => process.env.AUTOMATORS_MCP_TOKEN,
    onError: ({ event, kind, status }) => {
      console.error("Reporting failed", { event, kind, status });
    },
  });

export {
  extractTaggedUserIds,
  type AudienceEvidenceEntryParams,
} from "@bshaan77/eve-agent-reporting/client";
```

Point existing report calls at that local module. Keep agent slugs, credentials,
payloads, and capture logic unchanged. The collection URL above produces the
same three backend routes. Other organizations substitute their own URL and
token source.

## Roll out in stages

1. Release 0.3.0 with compatibility exports intact.
2. Existing `^0.2.0` dependencies stay on 0.2.x; update deliberately to 0.3.0.
3. Migrate one agent to the local adapter and check inbound, outbound, and
   audience events in its reporting service. Test omitted credentials and
   service failures too.
4. Migrate remaining consumers after that verification. No backend or database
   migration is required for Automators.
5. Remove the deprecated company adapter only in a future major release.

The configured client adds a five-second request timeout, rejects redirects,
and offers an error callback for non-2xx statuses. Report methods still return
`Promise<void>` and do not reject on transport failures. Await calls or use the
deployment host's supported background-task mechanism to keep requests alive.

## Naming

The existing npm name remains unchanged to avoid a second migration. Publishing
under a different scope later would be a separate distribution decision.
