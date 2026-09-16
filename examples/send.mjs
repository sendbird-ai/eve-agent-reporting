import { createReportingClient } from "@bshaan77/eve-agent-reporting/client";

if (!process.env.REPORTING_TOKEN) throw new Error("REPORTING_TOKEN is required");
const reporting = createReportingClient({
  baseUrl: process.env.REPORTING_BASE_URL ?? "http://127.0.0.1:8787/api/agents",
  token: () => process.env.REPORTING_TOKEN,
  onError: (failure) => {
    console.error("Reporting failed", failure);
    process.exitCode = 1;
  },
});
const slug = "support-assistant";
const channelId = "C123ABC";
await reporting.reportInboundEvent({
  slug,
  channelId,
  slackUserId: "U123ABC",
  sessionTurnKey: "1750000000.000001",
});
await reporting.reportOutboundEvent({
  slug,
  channelId,
  slackMessageTs: "1750000001.000001",
  isThreadReply: true,
});
await reporting.reportAudienceEvidence({
  slug,
  entries: [
    {
      channelId,
      slackUserId: "U123ABC",
      evidenceKind: "TRIGGERED",
      sourceEventId: "1750000000.000001",
    },
  ],
});
if (!process.exitCode)
  console.log("Sent inbound, outbound, and audience events. Re-run to exercise deduplication.");
