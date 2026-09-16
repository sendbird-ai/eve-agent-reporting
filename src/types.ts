/** A received Slack interaction. Reuse sessionTurnKey when retrying an event. */
export interface ReportInboundEventParams {
  /** Agent identifier understood by your receiver, e.g. "support-assistant". */
  slug: string;
  slackUserId: string;
  channelId: string;
  sessionTurnKey: string;
  messageCount?: number;
}

/** A sent Slack message, identified by its actual Slack message timestamp. */
export interface ReportOutboundEventParams {
  slug: string;
  slackMessageTs: string;
  channelId: string;
  teamId?: string | null;
  isThreadReply?: boolean;
  /** Optional label describing the sender, e.g. "scheduled-summary". */
  sourceTool?: string | null;
}

/** How a Slack user participated in, or was addressed by, an interaction. */
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
  /** Stable identifier for this occurrence, typically a Slack message timestamp. */
  sourceEventId: string;
}

/** Batch of observations about the audience of an agent. */
export interface ReportAudienceEvidenceParams {
  slug: string;
  entries: AudienceEvidenceEntryParams[];
}
