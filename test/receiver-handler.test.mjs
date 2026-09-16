import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createReceiver } from "../examples/receiver.mjs";
import { createReportingClient } from "@bshaan77/eve-agent-reporting/client";

test("receiver handler validates and deduplicates all client payloads without company services", async () => {
  const { handle, counts } = createReceiver({ token: "test-token" });
  const transport = async (url, init) => {
    const req = Readable.from([init.body]);
    req.url = new URL(url).pathname;
    req.method = init.method;
    req.headers = init.headers;
    let status;
    let response;
    await handle(req, {
      writeHead(value) {
        status = value;
      },
      end(body) {
        response = new Response(body, { status });
      },
    });
    return response;
  };
  const errors = [];
  const options = {
    baseUrl: "http://localhost/api/agents",
    token: "test-token",
    fetch: transport,
    onError: (error) => errors.push(error),
  };
  const reporting = createReportingClient(options);
  const slug = "support-assistant";
  const inbound = { slug, slackUserId: "U123ABC", channelId: "C123ABC", sessionTurnKey: "turn:1" };
  const outbound = { slug, channelId: "C123ABC", slackMessageTs: "1750000001.000001" };
  const entry = {
    slackUserId: "U123ABC",
    channelId: "C123ABC",
    evidenceKind: "TRIGGERED",
    sourceEventId: "1750000000.000001",
  };
  for (let repeat = 0; repeat < 2; repeat++) {
    await reporting.reportInboundEvent(inbound);
    await reporting.reportOutboundEvent(outbound);
    await reporting.reportAudienceEvidence({ slug, entries: [entry, entry] });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(counts, { inbound: 1, outbound: 1, audience: 1 });
  await createReportingClient({ ...options, token: "incorrect" }).reportInboundEvent(inbound);
  assert.equal(errors.at(-1).status, 401);
  await reporting.reportInboundEvent({ ...inbound, slug: "different-agent" });
  assert.equal(errors.at(-1).status, 403);
  for (const messageCount of [0, -1, 1.5, 10001, null]) {
    await reporting.reportInboundEvent({ ...inbound, messageCount });
    assert.equal(errors.at(-1).status, 400);
  }
  await reporting.reportOutboundEvent({ ...outbound, isThreadReply: "yes" });
  assert.equal(errors.at(-1).status, 400);
  await reporting.reportAudienceEvidence({
    slug,
    entries: [{ ...entry, evidenceKind: "UNKNOWN" }],
  });
  assert.equal(errors.at(-1).status, 400);
  await reporting.reportAudienceEvidence({ slug, entries: Array(201).fill(entry) });
  assert.equal(errors.at(-1).status, 400);
  const malformed = await transport(`${options.baseUrl}/${slug}/events`, {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(counts, { inbound: 1, outbound: 1, audience: 1 });
});
