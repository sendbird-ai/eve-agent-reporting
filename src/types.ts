export interface ReportInboundEventParams {
  slug: string;
  slackUserId: string;
  channelId: string;
  sessionTurnKey: string;
  messageCount?: number;
}

export interface ReportOutboundEventParams {
  slug: string;
  slackMessageTs: string;
  channelId: string;
  teamId?: string | null;
  isThreadReply?: boolean;
  sourceTool?: string | null;
}

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
  sourceEventId: string;
}

export interface ReportAudienceEvidenceParams {
  slug: string;
  entries: AudienceEvidenceEntryParams[];
}

/** Versioned generic telemetry. Receiver support must be deployed separately. */
export interface ReportTelemetryEventParams {
  slug: string;
  schemaVersion: 1;
  eventId: string;
  occurredAt: string;
  kind: string;
  source: string;
  attributes?: Record<string, string | number | boolean | null>;
}
