import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createReportingClient } from "@bshaan77/eve-agent-reporting/client";
import { createReceiver } from "../examples/receiver.mjs";

test("local receiver accepts, deduplicates, validates, and authorizes real HTTP events", async (t) => {
  const { server, counts } = createReceiver({ token: "test-token" });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      })
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/agents`;
  const errors = [];
  const reporting = createReportingClient({
    baseUrl,
    token: "test-token",
    onError: (error) => errors.push(error),
  });
  const slug = "support-assistant";
  for (let repeat = 0; repeat < 2; repeat++) {
    await reporting.reportInboundEvent({
      slug,
      slackUserId: "U123ABC",
      channelId: "C123ABC",
      sessionTurnKey: "turn:1",
    });
    await reporting.reportOutboundEvent({
      slug,
      channelId: "C123ABC",
      slackMessageTs: "1750000001.000001",
    });
    await reporting.reportAudienceEvidence({
      slug,
      entries: [
        {
          slackUserId: "U123ABC",
          channelId: "C123ABC",
          evidenceKind: "TRIGGERED",
          sourceEventId: "1750000000.000001",
        },
      ],
    });
  }
  assert.deepEqual(counts, { inbound: 1, outbound: 1, audience: 1 });
  assert.deepEqual(errors, []);
  await reporting.reportInboundEvent({
    slug: "different-agent",
    slackUserId: "U123ABC",
    channelId: "C123ABC",
    sessionTurnKey: "turn:2",
  });
  assert.equal(errors.at(-1).status, 403);
  await reporting.reportInboundEvent({
    slug,
    slackUserId: "",
    channelId: "C123ABC",
    sessionTurnKey: "turn:2",
  });
  assert.equal(errors.at(-1).status, 400);
  const unauthorized = await fetch(`${baseUrl}/${slug}/events`, {
    method: "POST",
    headers: { authorization: "Bearer incorrect" },
    body: "{}",
  });
  assert.equal(unauthorized.status, 401);
  const malformed = await fetch(`${baseUrl}/${slug}/events`, {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(counts, { inbound: 1, outbound: 1, audience: 1 });
});
