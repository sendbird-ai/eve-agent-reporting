import type {
  AudienceEvidenceEntryParams,
  ReportAudienceEvidenceParams,
  ReportInboundEventParams,
  ReportOutboundEventParams,
} from "./types.js";

export type {
  AudienceEvidenceEntryParams,
  EveAudienceEvidenceKind,
  ReportAudienceEvidenceParams,
  ReportInboundEventParams,
  ReportOutboundEventParams,
} from "./types.js";

const AUTOMATORS_BASE_URL = "https://automators.sdix.io";

/**
 * Reports one completed inbound Slack turn to the Automators dashboard's
 * Eve-agent usage system — populates EveAgentConversationEvent, which
 * powers the org chart / grid card "N users this week" and the agent
 * detail page's Usage tab. Best-effort, fire-and-forget: reads
 * AUTOMATORS_MCP_TOKEN from the caller's own environment (never accepted
 * as a parameter, so it's never accidentally logged or passed through);
 * silently no-ops when unset, and swallows request failures after
 * logging — a broken reporting call must never fail the turn it reports.
 */
export async function reportInboundEvent(params: ReportInboundEventParams): Promise<void> {
  const token = process.env.AUTOMATORS_MCP_TOKEN;
  if (!token) return;

  const { slug, ...body } = params;
  try {
    await fetch(`${AUTOMATORS_BASE_URL}/api/eve-agents/${slug}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`[eve-agent-reporting] failed to report inbound event for ${slug}`, error);
  }
}

/**
 * Reports one outbound Slack post to the Automators dashboard's Eve-agent
 * usage system — populates EveAgentOutboundMessage, which powers the "N
 * messages sent" / "N thread replies sent" tiles alongside the existing
 * inbound count. Same best-effort, fire-and-forget, token-from-env
 * semantics as reportInboundEvent.
 */
export async function reportOutboundEvent(params: ReportOutboundEventParams): Promise<void> {
  const token = process.env.AUTOMATORS_MCP_TOKEN;
  if (!token) return;

  const { slug, ...body } = params;
  try {
    await fetch(`${AUTOMATORS_BASE_URL}/api/eve-agents/${slug}/outbound-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`[eve-agent-reporting] failed to report outbound event for ${slug}`, error);
  }
}

/**
 * Reports one or more audience-evidence rows (e.g. a group DM's full
 * roster, or a single TRIGGERED/THREAD_REPLY/TAGGED_BY_AGENT observation)
 * to the Automators dashboard's range-scoped audience roster. Same
 * best-effort, fire-and-forget, token-from-env semantics as
 * reportInboundEvent. No-ops on an empty entries list — nothing to send.
 */
export async function reportAudienceEvidence(params: ReportAudienceEvidenceParams): Promise<void> {
  const token = process.env.AUTOMATORS_MCP_TOKEN;
  if (!token) return;

  const { slug, entries } = params;
  if (entries.length === 0) return;

  try {
    await fetch(`${AUTOMATORS_BASE_URL}/api/eve-agents/${slug}/audience-evidence`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ entries } satisfies { entries: AudienceEvidenceEntryParams[] }),
    });
  } catch (error) {
    console.error(`[eve-agent-reporting] failed to report audience evidence for ${slug}`, error);
  }
}

const TAGGED_USER_ID_RE = /<@([A-Z0-9]+)>/g;

/**
 * Extracts distinct Slack user ids an agent tagged (`<@U123ABC>`) in an
 * outbound message's text — the TAGGED_BY_AGENT evidence source for a
 * channel broadcast where there's no structured recipient parameter. Pure
 * function, no I/O; order not significant, duplicates removed.
 */
export function extractTaggedUserIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(TAGGED_USER_ID_RE)) {
    ids.add(match[1]);
  }
  return [...ids];
}
