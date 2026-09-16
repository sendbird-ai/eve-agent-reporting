import assert from "node:assert/strict";
import { test } from "node:test";
import * as reporting from "@bshaan77/eve-agent-reporting";

test("v0.2 call sites retain routes, payloads, token lookup, return types, and fail-open behavior", async (t) => {
  const originalToken = process.env.AUTOMATORS_MCP_TOKEN;
  t.after(() => {
    if (originalToken === undefined) delete process.env.AUTOMATORS_MCP_TOKEN;
    else process.env.AUTOMATORS_MCP_TOKEN = originalToken;
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: 500 });
  });
  const slug = "automators--wiki-eve";
  const cases = [
    [
      "reportInboundEvent",
      "events",
      {
        slackUserId: "U123ABC",
        channelId: "C123ABC",
        sessionTurnKey: "session:turn",
        messageCount: 1,
      },
    ],
    [
      "reportOutboundEvent",
      "outbound-events",
      {
        slackMessageTs: "1750000001.000001",
        channelId: "C123ABC",
        teamId: null,
        isThreadReply: true,
        sourceTool: "reactive-reply",
      },
    ],
    [
      "reportAudienceEvidence",
      "audience-evidence",
      {
        entries: [
          {
            slackUserId: "U123ABC",
            channelId: "C123ABC",
            sourceEventId: "1750000000.000001",
            evidenceKind: "TRIGGERED",
          },
        ],
      },
    ],
  ];
  delete process.env.AUTOMATORS_MCP_TOKEN;
  for (const [method, , body] of cases)
    assert.equal(await reporting[method]({ slug, ...body }), undefined);
  assert.equal(requests.length, 0);
  for (const [method, path, body] of cases) {
    process.env.AUTOMATORS_MCP_TOKEN = `rotating-${path}`;
    assert.equal(await reporting[method]({ slug, ...body }), undefined);
    assert.deepEqual(requests.at(-1), {
      url: `https://automators.sdix.io/api/eve-agents/${slug}/${path}`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer rotating-${path}` },
        body: JSON.stringify(body),
      },
    });
  }
  await reporting.reportAudienceEvidence({ slug, entries: [] });
  assert.equal(requests.length, 3);
  globalThis.fetch.mock.mockImplementation(async () => {
    throw new Error("offline");
  });
  t.mock.method(console, "error", () => {});
  for (const [method, , body] of cases)
    await assert.doesNotReject(reporting[method]({ slug, ...body }));
  assert.equal(console.error.mock.callCount(), 3);
  assert.deepEqual(reporting.extractTaggedUserIds("<@U123ABC> <@U123ABC>"), ["U123ABC"]);
  assert.equal(typeof reporting.createReportingClient, "function");
});
