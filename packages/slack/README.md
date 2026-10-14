# Shared Slack behavior

`@bshaan77/eve-agent-slack` is an optional, independently versioned **0.1.0 candidate**.
It has no runtime dependencies, credentials, SDK imports or posting tools. Install it
without the reporting or developer packages. Node 20 or later is required.

## Contracts

Source declarations and exports in `src/` are authoritative:

| API | Purpose | Boundary |
| --- | --- | --- |
| `createSlackDirectory` | Bounded audience lookup and exact person lookup by ID or email | Host supplies read transport and trusted technical-user IDs. Profile titles never establish roles. |
| `buildThreadContext` | Parent/card text plus recent replies with stable speaker attribution | Host supplies fetched messages and an explicit completeness flag. Clipping is visible. |
| `formatSlackBrief` | Share exact request, requested period, audience hint and relevant thread with a specialist | Data is untrusted context, not a permission or dispatch policy. |
| `normalizeSlackText` | Conservative double-bold conversion outside code | Ambiguous emphasis, unsupported tables and unclosed fences are flagged. No table rendering or content summarization. |
| `renderSlackAnswer` | Render a concise lead, sourced findings, coverage caveats and optional details link | Returns `ready` with `{text}`, or `overflow` with all content intact. Does not publish anything. |
| `prompts/slack.md` | Shared runtime guidance | Hosts must explicitly load it for root and specialists. Merely installing it changes nothing. |

```ts
import { createSlackDirectory, renderSlackAnswer } from '@bshaan77/eve-agent-slack';

const directory = createSlackDirectory({
  read: host.readSlack, // authenticated, scope-limited, deadline-bounded callback
  technicalUserIds: host.presentationPolicy.technicalUserIds,
});
const audience = await directory.audience(host.channelId);
const result = renderSlackAnswer({
  lead: 'One product announcement in the requested week.',
  findings: [{
    text: 'The vendor announced a new integration.',
    sources: [{ label: 'Announcement', url: 'https://example.com/news' }],
  }],
  caveats: ['Availability is not confirmed by the source.'],
});
if (result.status === 'ready') {
  await host.authorizedThreadPost(result.payload);
} else {
  // Ask the specialist for a scoped answer or use an authorized artifact publisher.
  // Do not post an overflow blindly or truncate away its citations/caveats.
  await host.handleOverflow(result);
}
```

`technicalUserIds` is a presentation preference, never a grant to read data or send
messages. Public channels always get plain language: current membership does not
establish everyone who may read the channel. External or unknown sharing state,
failed profiles, unfinished pagination and empty human audiences also default to
plain language. This is not a confidentiality boundary; host authorization still
controls retrieval, disclosure and delivery. A person lookup returns no email address.

The host read callback supports only `conversations.info`, `conversations.members`,
`users.info`, and `users.lookupByEmail`. Use the corresponding Slack read scopes;
email lookup additionally needs `users:read.email`. Missing scopes produce unknown
results. Apply transport timeouts/retry budgets in the host; the package bounds
member/page counts, not network duration. No cross-request cache is maintained.
The host binds each directory to one workspace and must not mix identities from
other workspaces. No raw provider failure is returned or logged by this package.

## Adoption

See `examples/slack-consumer/adapter.ts` in the repository for Eve dispatch mapping.
The adapter preserves framework authentication and does not change routing or
external-channel posting policy. Thread refresh can be incomplete; it does not claim
complete history. Avoid injecting the same history twice through both the custom
adapter and Eve's `threadContext` option.

Generate real instruction files from the installed `./prompts/slack.md` export for
each required agent and specialist. Record package version plus content hash; CI
must reject drift. Do not rely on symlinks or subagents inheriting root instructions.
Older consumers may forbid shortening specialist output: update those conflicts by
having the specialist produce the concise cited answer, not by stripping citations
at the router. Prompt guidance alone does not guarantee model behavior.

Before rollout, pin the exact released version, verify actual Slack scopes, run the
private consumer's behavior evaluations and rendered Slack tests, then canary one
consumer. Keep the previous lockfile and adapter for rollback. This candidate is
not published and is not evidence of a working production consumer.

## Deliberate limits

No proactive notification policy, durable queue, automatic retries for sends,
mention permission, card actions, native tables, artifact access checks, or business
roster is bundled. Existing `eve-agent-messaging` progress/send-observer APIs remain
separate and unchanged. Host delivery must cover reactive, scheduled and tool-based
paths explicitly; this package does not intercept them automatically.
