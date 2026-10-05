import { test } from "node:test";
import assert from "node:assert/strict";
import { createProgressRelay, createSendObserver, renderSlackProgress } from "../dist/index.js";
const event = (sequence, state = "progress") => ({
  taskId: "task-1",
  sequence,
  state,
  text: "working",
  thread: "1700000000.001",
});
test("concurrent duplicate/start/progress/terminal updates serialize; stale events are ignored", async () => {
  const sent = [];
  const relay = createProgressRelay({
    publish: async (e) => {
      await new Promise((r) => setTimeout(r, 2));
      sent.push(e);
    },
  });
  await Promise.all([
    relay.emit(event(0, "started")),
    relay.emit(event(0, "started")),
    relay.emit(event(1)),
    relay.emit(event(2, "completed")),
    relay.emit(event(3)),
  ]);
  assert.deepEqual(
    sent.map((e) => e.state),
    ["started", "progress", "completed"]
  );
  assert.equal(sent[0].thread, "1700000000.001");
});
for (const state of ["completed", "failed", "cancelled"])
  test(state + " is terminal", async () => {
    const relay = createProgressRelay({ publish: async () => {} });
    await relay.emit(event(0, "started"));
    await relay.emit(event(1, state));
    assert.equal(await relay.emit(event(2)), "ignored");
  });
test("failure leaves sequence retryable; capacity and task lifecycle fail explicitly", async () => {
  let fail = true;
  const relay = createProgressRelay({
    maxTasks: 1,
    publish: async () => {
      if (fail) throw Error("connector failure");
    },
  });
  await assert.rejects(relay.emit(event(0, "started")));
  fail = false;
  assert.equal(await relay.emit(event(0, "started")), "published");
  await assert.rejects(relay.emit({ ...event(0, "started"), taskId: "task-2" }), /capacity/);
  await assert.rejects(relay.emit({ ...event(0), taskId: "task-2" }), /start/);
});
test("host send observation covers all sources without taking dispatch ownership", async () => {
  const reports = [];
  const observe = createSendObserver(async (e) => reports.push(e));
  for (const source of ["reactive", "tool", "scheduled"]) {
    const send = { eventId: source, source, channel: "channel-1", messageId: source };
    await Promise.all([observe(send), observe(send)]);
    await observe(send);
  }
  assert.equal(reports.length, 3);
});
test("failed reporting remains retryable and bounded dedup has documented eviction", async () => {
  let fail = true;
  let calls = 0;
  const observe = createSendObserver(async () => {
    calls++;
    if (fail) throw Error("report failed");
  }, 1);
  const a = { eventId: "a", source: "tool", channel: "c", messageId: "1" };
  await assert.rejects(observe(a));
  fail = false;
  await observe(a);
  await observe({ ...a, eventId: "b", messageId: "2" });
  await observe(a);
  assert.equal(calls, 4);
});
test("Slack renderer escapes mention/link injection while retaining thread", () =>
  assert.deepEqual(renderSlackProgress({ ...event(1), text: "<@U123> & <https://example.com>" }), {
    text: "progress: &lt;@U123&gt; &amp; &lt;https://example.com&gt;",
    thread_ts: "1700000000.001",
  }));
