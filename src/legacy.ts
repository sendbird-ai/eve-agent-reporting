// Compatibility implementation for v0.1/v0.2 callers. New integrations use client.ts.
import type {
  AudienceEvidenceEntryParams,
  ReportAudienceEvidenceParams,
  ReportInboundEventParams,
  ReportOutboundEventParams,
} from "./types.js";

const AUTOMATORS_BASE_URL = "https://automators.sdix.io";

/** @deprecated Use createReportingClient with explicit configuration. */
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

/** @deprecated Use createReportingClient with explicit configuration. */
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

/** @deprecated Use createReportingClient with explicit configuration. */
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
