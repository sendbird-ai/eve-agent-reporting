# @sendbird-ai/eve-agent-reporting

Shared reporting client for Sendbird [eve](https://vercel.com/docs/eve) agents. Standardizes how every eve agent — in the automators monorepo or an external repo — reports usage events to the Automators dashboard, instead of each agent hand-maintaining its own copy of this HTTP call.

This package covers the **reporting client only**: constructing and POSTing the event payload. It does not — and cannot — cover an agent's own event *capture* (reading `channel`/`ctx` from eve's runtime, diffing thread replies, etc.), since that needs each agent's own eve runtime objects and differs by dispatch shape. An agent's `channels/slack.ts` does its own capture, then calls this package's exports with the result.

## Install

```bash
npm install @sendbird-ai/eve-agent-reporting
```

## Usage

```ts
import { reportInboundEvent } from "@sendbird-ai/eve-agent-reporting";

// Inside a message.completed handler, after a successful reply:
void reportInboundEvent({
  slug: "automators--wiki-eve", // this agent's registered EveAgent slug
  slackUserId: triggeringUserId,
  channelId,
  sessionTurnKey: `${ctx.session.id}:${ctx.session.turn.id}`,
  messageCount: 1,
});
```

Reads `AUTOMATORS_MCP_TOKEN` from `process.env` at call time — the same token every agent already uses for its Automators MCP connection. Never accepted as a parameter, so it can't be accidentally logged or passed through. Silently no-ops when the token is unset, and swallows request failures after logging one — a broken reporting call must never fail the turn it's reporting on.

## Versioning

- **v0.1.x** — `reportInboundEvent` only, matching the wire shape every agent already used before this package existed.
- **v0.2.x** (planned) — adds `reportOutboundEvent`, `reportAudienceEvidence`, and `extractTaggedUserIds`, per [spec 2.53](https://app.notion.com/p/3cac36aa12c281fca34aec78b37ac7c1).
