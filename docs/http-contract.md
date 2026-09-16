# HTTP receiver contract

The client targets a collection URL chosen by the application, such as
`https://reports.example.com/api/agents`. Every request is a JSON `POST` with
`Content-Type: application/json` and `Authorization: Bearer <configured token>`.
The agent slug is encoded as one URL path segment and is excluded from the body.

| Method                   | Path appended to collection URL | JSON body                                                                       |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------- |
| `reportInboundEvent`     | `/{slug}/events`                | `slackUserId`, `channelId`, `sessionTurnKey`, optional `messageCount`           |
| `reportOutboundEvent`    | `/{slug}/outbound-events`       | `slackMessageTs`, `channelId`, optional `teamId`, `isThreadReply`, `sourceTool` |
| `reportAudienceEvidence` | `/{slug}/audience-evidence`     | `{ "entries": [...] }`                                                          |

Audience entries contain `slackUserId`, `evidenceKind`, `channelId`,
`sourceEventId`, and optional `teamId`. Evidence kinds are:

- `TRIGGERED`: the user initiated an agent interaction.
- `GROUP_DM_MEMBER`: the user was in the group DM audience.
- `THREAD_REPLY`: the user replied after the agent participated in a thread.
- `TAGGED_BY_AGENT`: the agent mentioned the user.

The package exports TypeScript interfaces for every payload. IDs and
timestamps are strings. Optional `teamId` and `sourceTool` can also be `null`.
Omitted values are left to the receiver; the example defaults `messageCount` to
one and treats each outbound post as one message. These observations are not
proof that someone read a message.

## Receiver responsibilities

Authenticate the token, authorize its access to the requested agent, validate
the JSON body, and persist events before responding successfully. Recommended
deduplication keys, within your tenant/workspace boundary:

- Inbound: `(slug, sessionTurnKey)`.
- Outbound: `(slug, slackMessageTs)`; include the channel if your source can
  reuse timestamps across channels.
- Audience: `(slug, slackUserId, evidenceKind, sourceEventId)`.

Accept repeated events without double counting. The client sends one request
per method call and does not split audience batches; callers should observe
their receiver's batch limit (the example and existing Automators receiver
accept at most 200 entries). Empty batches are not sent.

Any 2xx status is success; the response body is ignored. Return 400 for invalid
payloads, 401 for invalid credentials, and 403 for unauthorized agents. Non-2xx
responses, transport failures, and timeouts are reported through `onError`.
The client does not retry. Use HTTPS outside local development.

The example is a single-agent, in-memory demonstration, not durable analytics
storage. A production receiver supplies its own persistence, tenant isolation,
retention policy, and reporting queries.
