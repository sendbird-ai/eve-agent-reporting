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

/**
 * Payload for reportOutboundEvent — one row in EveAgentOutboundMessage per
 * outbound Slack post, across every send site (reactive reply, scheduled
 * digest, deterministic tool send, ...). Identified by the real Slack
 * message ts, not the inbound turn key — an inbound+outbound pair from the
 * same turn must never collide (spec 2.53).
 */
export interface ReportOutboundEventParams {
  /** The agent's registered EveAgent slug, e.g. "automators--wiki-eve" or "harper-eve". */
  slug: string;
  slackMessageTs: string;
  channelId: string;
  teamId?: string | null;
  /** True when this post replied into an existing thread. Defaults to false server-side. */
  isThreadReply?: boolean;
  /** Which send site produced this post, e.g. "reactive-reply" / "post_payroll_preview". Free-form, for debugging only. */
  sourceTool?: string | null;
}

/**
 * Every evidence kind an agent can credit a Slack user under for a given
 * range's audience roster (spec 2.53). Kept as a union here (not imported
 * from the database package) so this package never depends on Prisma.
 */
export type EveAudienceEvidenceKind =
  | "TRIGGERED"
  | "GROUP_DM_MEMBER"
  | "THREAD_REPLY"
  | "TAGGED_BY_AGENT";

export interface AudienceEvidenceEntryParams {
  slackUserId: string;
  evidenceKind: EveAudienceEvidenceKind;
  channelId: string;
  teamId?: string | null;
  /** A Slack ts (the triggering inbound message's, or the outbound post's) that makes this occurrence idempotent. Required — see the schema's own comment on why this can't be optional. */
  sourceEventId: string;
}

/** Payload for reportAudienceEvidence — one call can report a whole batch (e.g. a group DM's full roster) at once. */
export interface ReportAudienceEvidenceParams {
  /** The agent's registered EveAgent slug, e.g. "automators--wiki-eve" or "harper-eve". */
  slug: string;
  entries: AudienceEvidenceEntryParams[];
}
