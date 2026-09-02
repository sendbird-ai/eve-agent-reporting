/**
 * Payload for reportInboundEvent — one row in EveAgentConversationEvent per
 * completed Slack turn. Matches the existing /api/eve-agents/[slug]/events
 * wire shape exactly (spec 2.49); this package standardizes the call site,
 * not the schema.
 */
export interface ReportInboundEventParams {
  /** The agent's registered EveAgent slug, e.g. "automators--wiki-eve" or "harper-eve". */
  slug: string;
  slackUserId: string;
  channelId: string;
  sessionTurnKey: string;
  messageCount?: number;
}
