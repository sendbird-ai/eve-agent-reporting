import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createReportingClient, extractTaggedUserIds } from "@bshaan77/eve-agent-reporting/client";

const inbound = {
  slug: "support-assistant",
  slackUserId: "U123ABC",
  channelId: "C123ABC",
  sessionTurnKey: "turn:1",
  messageCount: 2,
};
const outbound = {
  slug: inbound.slug,
  channelId: inbound.channelId,
  slackMessageTs: "1750000001.000001",
  teamId: null,
  isThreadReply: true,
  sourceTool: "scheduled-summary",
};
const audience = {
  slug: inbound.slug,
  entries: [
    {
      slackUserId: inbound.slackUserId,
      channelId: inbound.channelId,
      evidenceKind: "TRIGGERED",
      sourceEventId: "1750000000.000001",
    },
  ],
};
const cases = [
  ["reportInboundEvent", inbound, "events"],
  ["reportOutboundEvent", outbound, "outbound-events"],
  ["reportAudienceEvidence", audience, "audience-evidence"],
];

test("sends all event shapes to the configured collection and keeps client credentials isolated", async () => {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: 204 });
  };
  const client = createReportingClient({
    baseUrl: "https://reports.example.com/custom/agents/",
    token: "first-token",
    fetch,
  });
  for (const [method, params, path] of cases) {
    await client[method](params);
    const { url, init } = requests.at(-1);
    const { slug, ...body } = params;
    assert.equal(url, `https://reports.example.com/custom/agents/${slug}/${path}`);
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), body);
    assert.equal(init.headers.authorization, "Bearer first-token");
    assert.equal(init.headers["content-type"], "application/json");
    assert.equal(init.redirect, "error");
  }
  const other = createReportingClient({
    baseUrl: "https://other.example.com/events",
    token: "second-token",
    fetch,
  });
  await other.reportInboundEvent(inbound);
  assert.equal(requests.at(-1).init.headers.authorization, "Bearer second-token");
  await client.reportInboundEvent(inbound);
  assert.equal(requests.at(-1).init.headers.authorization, "Bearer first-token");
});

test("rotating token providers are read at each call and empty credentials skip requests", async () => {
  let token;
  const headers = [];
  const client = createReportingClient({
    baseUrl: "https://example.com/agents",
    token: () => token,
    fetch: async (_, init) => {
      headers.push(init.headers.authorization);
      return new Response();
    },
  });
  for (const [method, params] of cases) await client[method](params);
  token = "one";
  await client.reportInboundEvent(inbound);
  token = "two";
  await client.reportInboundEvent(inbound);
  token = "";
  await client.reportInboundEvent(inbound);
  assert.deepEqual(headers, ["Bearer one", "Bearer two"]);
});

test("empty audience batches do not read credentials or send", async () => {
  const client = createReportingClient({
    baseUrl: "https://example.com/agents",
    token: () => assert.fail("token read"),
    fetch: () => assert.fail("fetch"),
  });
  await client.reportAudienceEvidence({ slug: "agent", entries: [] });
});

test("reports HTTP, network, and token failures without leaking sensitive errors or rejecting", async () => {
  const errors = [];
  const options = {
    baseUrl: "https://example.com/agents",
    token: "secret",
    onError: (error) => errors.push(error),
  };
  for (const status of [401, 403, 429, 500]) {
    const client = createReportingClient({
      ...options,
      fetch: async () => new Response("sensitive body", { status }),
    });
    await client.reportInboundEvent(inbound);
    assert.deepEqual(errors.at(-1), { event: "inbound", kind: "http", status });
  }
  await createReportingClient({
    ...options,
    fetch: async () => {
      throw new Error("secret");
    },
  }).reportOutboundEvent(outbound);
  assert.deepEqual(errors.at(-1), { event: "outbound", kind: "request" });
  await createReportingClient({
    ...options,
    token: () => {
      throw new Error("secret");
    },
  }).reportInboundEvent(inbound);
  assert.deepEqual(errors.at(-1), { event: "inbound", kind: "token" });
  assert.doesNotMatch(JSON.stringify(errors), /secret|sensitive/);
  for (const onError of [
    () => {
      throw new Error("logger");
    },
    async () => {
      throw new Error("logger");
    },
  ]) {
    await assert.doesNotReject(
      createReportingClient({
        ...options,
        onError,
        fetch: async () => new Response(null, { status: 500 }),
      }).reportInboundEvent(inbound)
    );
  }
});

test("aborts slow requests and reports the timeout without retries", async () => {
  const errors = [];
  let calls = 0;
  const client = createReportingClient({
    baseUrl: "https://example.com/agents",
    token: "token",
    timeoutMs: 10,
    onError: (error) => errors.push(error),
    fetch: async (_, { signal }) => {
      calls++;
      await delay(1000, undefined, { signal });
      return new Response();
    },
  });
  await client.reportInboundEvent(inbound);
  assert.equal(calls, 1);
  assert.deepEqual(errors, [{ event: "inbound", kind: "timeout" }]);
});

test("encodes slugs as one path segment and refuses empty or traversal slugs", async () => {
  const urls = [];
  const errors = [];
  const client = createReportingClient({
    baseUrl: "https://example.com/agents",
    token: "token",
    onError: (e) => errors.push(e),
    fetch: async (url) => {
      urls.push(url);
      return new Response();
    },
  });
  await client.reportInboundEvent({ ...inbound, slug: "a/b ?#" });
  assert.equal(urls[0], "https://example.com/agents/a%2Fb%20%3F%23/events");
  for (const slug of ["", ".", ".."]) await client.reportInboundEvent({ ...inbound, slug });
  assert.equal(urls.length, 1);
  assert.equal(errors.length, 3);
});

test("requires valid explicit configuration", () => {
  for (const baseUrl of [
    undefined,
    "",
    "/relative",
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com?q=1",
    "https://example.com/#x",
  ]) {
    assert.throws(() => createReportingClient({ baseUrl, token: "token" }), TypeError);
  }
  for (const timeoutMs of [0, -1, Infinity, NaN, 1.5, 2147483648]) {
    assert.throws(
      () => createReportingClient({ baseUrl: "https://example.com", token: "token", timeoutMs }),
      TypeError
    );
  }
  assert.throws(() => createReportingClient({ baseUrl: "https://example.com" }), TypeError);
});

test("Slack mentions remain distinct and preserve first occurrence order", () => {
  assert.deepEqual(extractTaggedUserIds("Hi <@U123ABC> <@U456DEF> <@U123ABC> <!here>"), [
    "U123ABC",
    "U456DEF",
  ]);
  assert.deepEqual(extractTaggedUserIds("no mentions"), []);
});
