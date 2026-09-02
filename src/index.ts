import type { ReportInboundEventParams } from "./types.js";

export type { ReportInboundEventParams } from "./types.js";

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
