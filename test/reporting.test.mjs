import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createReportingClient, extractTaggedUserIds } from "../dist/index.js";
const input = {
  slug: "support-assistant",
  slackUserId: "U123ABC",
  channelId: "C123ABC",
  sessionTurnKey: "turn:1",
  messageCount: 2,
};
const options = { baseUrl: "https://reports.example.com/api/agents", token: "synthetic-token" };
const response = (status) => new Response(null, { status });
test("requires explicit valid config and verified idempotency for retries", () => {
  for (const baseUrl of [
    "",
    "/relative",
    "file:///tmp/x",
    ["https:", "/", "/", "a:b@", "example.com"].join(""),
    "https://example.com/?x=1",
    "https://example.com/#x",
  ])
    assert.throws(() => createReportingClient({ ...options, baseUrl }));
  for (const timeoutMs of [0, NaN, 60001, 1.5])
    assert.throws(() => createReportingClient({ ...options, timeoutMs }));
  assert.throws(() => createReportingClient({ ...options, maxRetries: 1 }));
  assert.throws(() => createReportingClient({ ...options, token: undefined }));
});
test("all legacy-compatible payloads keep distinct routes and strip slug", async () => {
  const calls = [];
  const client = createReportingClient({
    ...options,
    fetch: async (url, init) => {
      calls.push([url, init]);
      return response(204);
    },
  });
  const outbound = {
    slug: input.slug,
    channelId: input.channelId,
    slackMessageTs: "1750000001.000001",
    isThreadReply: true,
    teamId: null,
    sourceTool: "scheduled-summary",
  };
  const audience = {
    slug: input.slug,
    entries: [
      {
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        evidenceKind: "TRIGGERED",
        sourceEventId: "1750000000.000001",
      },
    ],
  };
  for (const [method, value] of [
    ["reportInboundEvent", input],
    ["reportOutboundEvent", outbound],
    ["reportAudienceEvidence", audience],
  ])
    await client[method](value);
  assert.deepEqual(
    calls.map(([url]) => url.split("/").at(-1)),
    ["events", "outbound-events", "audience-evidence"]
  );
  for (let i = 0; i < 3; i++) {
    const { slug, ...body } = [input, outbound, audience][i];
    assert.deepEqual(JSON.parse(calls[i][1].body), body);
    assert.equal(calls[i][1].redirect, "error");
    assert.equal(calls[i][1].headers.authorization, "Bearer synthetic-token");
  }
});
test("auth is refreshed; empty auth is observable without a request", async () => {
  let token = "";
  let count = 0;
  const failures = [];
  const client = createReportingClient({
    ...options,
    token: () => token,
    onError: (f) => failures.push(f),
    fetch: async () => {
      count++;
      return response(204);
    },
  });
  await client.reportInboundEvent(input);
  assert.equal(count, 0);
  assert.equal(failures[0].kind, "missing-token");
  token = "replacement";
  await client.reportInboundEvent(input);
  assert.equal(count, 1);
});
for (const [name, overrides, kind] of [
  [
    "rejected auth",
    {
      token: async () => {
        throw Error("private-value");
      },
    },
    "token",
  ],
  ["hanging auth", { token: () => new Promise(() => {}) }, "timeout"],
  ["hanging fetch", { fetch: () => new Promise(() => {}) }, "timeout"],
  [
    "thrown fetch",
    {
      fetch: () => {
        throw Error("private-value");
      },
    },
    "request",
  ],
  ["HTTP error", { fetch: async () => response(403) }, "http"],
])
  test(name + " is bounded and redacts diagnostics", async () => {
    const failures = [];
    const client = createReportingClient({
      ...options,
      timeoutMs: 40,
      ...overrides,
      onError: (f) => {
        failures.push(f);
        return new Promise(() => {});
      },
    });
    const start = Date.now();
    await client.reportInboundEvent(input);
    assert.ok(Date.now() - start < 500);
    assert.equal(failures[0].kind, kind);
    assert.ok(!JSON.stringify(failures).includes("private-value"));
    assert.ok(!JSON.stringify(failures).includes(input.slug));
  });
test("retry preserves event key and payload; distinct events remain distinct", async () => {
  const bodies = [];
  const client = createReportingClient({
    ...options,
    receiverIdempotent: true,
    maxRetries: 1,
    fetch: async (_, init) => {
      bodies.push(init.body);
      return response(bodies.length === 1 ? 503 : 204);
    },
  });
  await client.reportInboundEvent(input);
  await client.reportInboundEvent({ ...input, sessionTurnKey: "turn:2" });
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0], bodies[1]);
  assert.notEqual(bodies[1], bodies[2]);
});
test("does not retry unauthorized requests and aborts at total deadline", async () => {
  let calls = 0;
  const failures = [];
  const client = createReportingClient({
    ...options,
    receiverIdempotent: true,
    maxRetries: 3,
    timeoutMs: 20,
    onError: (f) => failures.push(f),
    fetch: async () => {
      calls++;
      return response(403);
    },
  });
  await client.reportInboundEvent(input);
  assert.equal(calls, 1);
  assert.equal(failures[0].status, 403);
});
test("bad identities, cyclic bodies and throwing diagnostics cannot fail a turn", async () => {
  let calls = 0;
  const client = createReportingClient({
    ...options,
    onError: () => {
      throw Error("private");
    },
    fetch: async () => {
      calls++;
      return response(204);
    },
  });
  for (const slug of ["..", "../other", "a/b", "a?token=x", "a#b"])
    await client.reportInboundEvent({ ...input, slug });
  const cyclic = { ...input };
  cyclic.other = cyclic;
  await client.reportInboundEvent(cyclic);
  assert.equal(calls, 0);
  await client.reportAudienceEvidence({ slug: input.slug, entries: [] });
  assert.equal(calls, 0);
});
test("generic telemetry uses actual identity and explicit version, never fabricated Slack IDs", async () => {
  let body;
  const client = createReportingClient({
    ...options,
    fetch: async (url, init) => {
      assert.ok(url.endsWith("/telemetry-events"));
      body = JSON.parse(init.body);
      return response(204);
    },
  });
  await client.reportTelemetryEvent({
    slug: "api-assistant",
    schemaVersion: 1,
    eventId: "job:1",
    occurredAt: "2026-01-01T00:00:00Z",
    kind: "task.completed",
    source: "api",
    attributes: { durationMs: 17 },
  });
  assert.equal(body.eventId, "job:1");
  assert.ok(!("slackUserId" in body));
});
test("real HTTP capture proves auth, payload parity and receiver-owned dedup", async () => {
  const stored = new Map();
  const server = createServer(async (req, res) => {
    let data = "";
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    assert.equal(req.headers.authorization, "Bearer synthetic-token");
    stored.set(body.sessionTurnKey, body);
    res.writeHead(204);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = createReportingClient({
      ...options,
      baseUrl: `http://127.0.0.1:${server.address().port}/api/agents`,
    });
    await client.reportInboundEvent(input);
    await client.reportInboundEvent(input);
    await client.reportInboundEvent({ ...input, sessionTurnKey: "turn:2" });
    assert.equal(stored.size, 2);
    assert.deepEqual(stored.get("turn:1"), (({ slug, ...body }) => body)(input));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test("tag extraction is pure and distinct", () =>
  assert.deepEqual(extractTaggedUserIds("<@U123ABC> <@U123ABC> <@U456DEF>"), [
    "U123ABC",
    "U456DEF",
  ]));

test("opaque existing turn keys are preserved and throwing payload accessors are isolated", async () => {
  let body;
  const client = createReportingClient({
    ...options,
    fetch: async (_, init) => {
      body = JSON.parse(init.body);
      return response(204);
    },
  });
  await client.reportInboundEvent({ ...input, sessionTurnKey: "slack/channel/thread:turn 1" });
  assert.equal(body.sessionTurnKey, "slack/channel/thread:turn 1");
  await client.reportAudienceEvidence({
    get entries() {
      throw Error("invalid payload accessor");
    },
  });
});
