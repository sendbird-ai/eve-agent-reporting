import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDeveloper, validatePolicy } from "../dist/extension/lib/core.mjs";
const policy = (repository = "example-org/example-repo", destination = "project-a") => ({
  repositories: [
    {
      repository,
      baseBranch: "main",
      branchPrefix: "assistant/",
      readablePaths: ["."],
      writablePaths: ["src", "test"],
      protectedPaths: ["src/generated"],
      checks: ["test"],
    },
  ],
  developerModel: "openai/gpt-5.4",
  developerModelFamily: "family-a",
  reviewModel: "review-model",
  requireIndependentReview: true,
  ticketDestination: destination,
  maxFileBytes: 10000,
});
function fixture() {
  const runs = new Map(),
    files = new Map([["src/main.ts", "old"]]);
  const queues = new Map();
  let initialized = 0,
    published = 0,
    reviewed = 0;
  const state = {
    extra: [],
    checkFailed: false,
    checkMutates: false,
    reviewFamily: "family-b",
    reviewMutates: false,
    leaseFails: false,
    destination: null,
  };
  const hash = () =>
    createHash("sha256")
      .update(JSON.stringify([...files]))
      .digest("hex");
  const workspace = {
    canonicalPath: async (path) => (path === "src/link.ts" ? "outside/secret" : path),
    read: async (path) => files.get(path) ?? null,
    write: async (p, c) => files.set(p, c),
    list: async () => [...files.keys(), ".env", "../outside", "src/link.ts"],
    diff: async () => ({
      fingerprint: hash(),
      files: [...files]
        .filter(([p, c]) => p !== "src/main.ts" || c !== "old")
        .map(([path]) => ({ path, symlink: false }))
        .concat(state.extra),
      patch: JSON.stringify([...files]),
    }),
    runCheck: async () => {
      if (state.checkMutates) files.set("src/check-mutated.ts", "x");
      return {
        exitCode: state.checkFailed ? 1 : 0,
        assertionsPassed: 1,
        assertionsFailed: state.checkFailed ? 1 : 0,
        setupFailed: false,
        artifact: "artifact:test",
      };
    },
    context: async () => ({ instructions: "Synthetic repository instructions", skills: [] }),
  };
  const host = {
    async withLease(repo, id, callback) {
      if (state.leaseFails) throw Error("reservation unavailable");
      const previous = queues.get(repo) ?? Promise.resolve();
      let release;
      const current = new Promise((r) => (release = r));
      queues.set(repo, current);
      await previous;
      try {
        return await callback("fence:" + id);
      } finally {
        release();
      }
    },
    loadRun: async (id) => structuredClone(runs.get(id) ?? null),
    saveRun: async (id, record) => runs.set(id, structuredClone(record)),
    workspace: async (id, repo, branch, init) => {
      if (init) initialized++;
      return workspace;
    },
    createTicket: async (input) => {
      state.destination = input.destination;
      return { reference: "TASK-1" };
    },
    review: async () => {
      reviewed++;
      if (state.reviewMutates) files.set("src/main.ts", "race");
      return {
        verdict: "approve",
        model: "review-model",
        modelFamily: state.reviewFamily,
        provider: "example-provider",
        fallback: state.reviewFamily === "family-a",
        artifact: "artifact:review",
      };
    },
    publishDraft: async (input) => {
      assert.equal(input.fence, "fence:" + input.runId);
      published++;
      return { url: "https://example.com/draft/1" };
    },
  };
  return { host, state, files, runs, counts: () => ({ initialized, published, reviewed }) };
}
async function start(
  engine,
  id = "run-1",
  mode = "develop",
  repository = "example-org/example-repo"
) {
  return engine.initialize(id, { repository, branch: "assistant/task-1", mode });
}
async function ready(engine, id = "run-1") {
  await engine.ticket(id, { title: "Scoped change", description: "Synthetic acceptance" });
  await engine.edit(id, { path: "src/main.ts", oldText: "old", newText: "new" });
  await engine.checks(id);
  await engine.review(id);
}
test("policy rejects unconfigured repositories, writable scope expansion and unsafe branches", async () => {
  const f = fixture(),
    engine = createDeveloper(policy(), f.host);
  await assert.rejects(start(engine, "run-1", "develop", "other/repo"), /not allowed/);
  await assert.rejects(
    engine.initialize("run-1", {
      repository: "example-org/example-repo",
      branch: "main",
      mode: "develop",
    }),
    /exceeds/
  );
  assert.throws(() =>
    validatePolicy({
      ...policy(),
      repositories: [{ ...policy().repositories[0], readablePaths: ["src"], writablePaths: ["."] }],
    })
  );
  assert.equal(f.counts().initialized, 0);
});
test("research mode cannot edit, file tickets, check or publish", async () => {
  const f = fixture(),
    e = createDeveloper(policy(), f.host);
  await start(e, "r", "research");
  assert.equal(await e.read("r", "src/main.ts"), "old");
  for (const action of [
    () => e.edit("r", { path: "src/main.ts", oldText: "old", newText: "new" }),
    () => e.ticket("r", { title: "x", description: "x" }),
    () => e.checks("r"),
    () => e.publish("r"),
  ])
    await assert.rejects(action());
  assert.equal(f.counts().published, 0);
});
test("traversal, credential files, symlink aliases and protected paths fail before writing", async () => {
  const f = fixture(),
    e = createDeveloper(policy(), f.host);
  await start(e);
  for (const path of [
    "../src/main.ts",
    "src/../main.ts",
    "/workspace/src/main.ts",
    ".env",
    "src/.env.local",
    "src/link.ts",
    "src/generated/types.ts",
  ])
    await assert.rejects(e.write("run-1", path, "x"));
  assert.deepEqual(await e.list("run-1"), ["src/main.ts"]);
  assert.equal(f.files.size, 1);
});
test("whole-diff gate blocks shell-created forbidden files, symlinks and renamed source paths", async () => {
  for (const file of [
    { path: "../outside", symlink: false },
    { path: ".github/workflows/ci.yml", symlink: false },
    { path: "src/link.ts", symlink: true },
    { path: "src/new.ts", previousPath: "private/old.ts", symlink: false },
  ]) {
    const f = fixture(),
      e = createDeveloper(policy(), f.host);
    await start(e);
    await ready(e);
    f.state.extra = [file];
    await assert.rejects(e.publish("run-1"), /policy|protected/);
    assert.equal(f.counts().published, 0);
  }
});
test("edits invalidate review and checks; changed diff after review cannot publish", async () => {
  const f = fixture(),
    e = createDeveloper(policy(), f.host);
  await start(e);
  await ready(e);
  await e.edit("run-1", { path: "src/main.ts", oldText: "new", newText: "newer" });
  await assert.rejects(e.publish("run-1"));
  await e.checks("run-1");
  await e.review("run-1");
  f.files.set("src/other.ts", "changed outside tool");
  await assert.rejects(e.publish("run-1"));
  assert.equal(f.counts().published, 0);
});
test("check failures, working-tree mutation and reviewer races do not grant publication", async () => {
  for (const mode of ["checkFailed", "checkMutates", "reviewMutates"]) {
    const f = fixture(),
      e = createDeveloper(policy(), f.host);
    await start(e);
    await e.edit("run-1", { path: "src/main.ts", oldText: "old", newText: "new" });
    f.state[mode] = true;
    if (mode === "checkFailed") {
      await e.checks("run-1");
      await assert.rejects(e.review("run-1"));
    } else if (mode === "checkMutates") await assert.rejects(e.checks("run-1"), /changed/);
    else {
      await e.checks("run-1");
      await assert.rejects(e.review("run-1"), /changed/);
    }
    assert.equal(f.counts().published, 0);
  }
});
test("same-family review fallback is rejected when independence is required", async () => {
  const f = fixture(),
    e = createDeveloper(policy(), f.host);
  await start(e);
  await e.edit("run-1", { path: "src/main.ts", oldText: "old", newText: "new" });
  await e.checks("run-1");
  f.state.reviewFamily = "family-a";
  await assert.rejects(e.review("run-1"), /not independent/);
});
test("cold-start instance resumes durable run and cannot reset identity", async () => {
  const f = fixture(),
    first = createDeveloper(policy(), f.host);
  await start(first);
  await ready(first);
  const second = createDeveloper(policy(), f.host);
  await start(second);
  assert.equal(f.counts().initialized, 1);
  await assert.rejects(
    second.initialize("run-1", {
      repository: "example-org/example-repo",
      branch: "assistant/other",
      mode: "develop",
    }),
    /already bound/
  );
  await second.publish("run-1");
  assert.equal(f.counts().published, 1);
});
test("concurrent publishers reuse one recorded draft; missing reservation fails closed", async () => {
  const f = fixture(),
    a = createDeveloper(policy(), f.host),
    b = createDeveloper(policy(), f.host);
  await start(a);
  await ready(a);
  await Promise.all([a.publish("run-1"), b.publish("run-1")]);
  assert.equal(f.counts().published, 1);
  f.state.leaseFails = true;
  await assert.rejects(b.read("run-1", "src/main.ts"));
});
test("two differently configured consumers use unchanged shared source and route tickets privately", async () => {
  for (const [repo, destination] of [
    ["example-org/example-repo", "project-a"],
    ["other-org/other-repo", "project-b"],
  ]) {
    const f = fixture(),
      e = createDeveloper(policy(repo, destination), f.host);
    await start(e, "run-1", "develop", repo);
    await ready(e);
    assert.equal(f.state.destination, destination);
    await e.publish("run-1");
  }
});
