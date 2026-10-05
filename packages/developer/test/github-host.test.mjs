import { test } from "node:test";
import assert from "node:assert/strict";
import { createGitHubHost } from "../dist/extension/lib/github-host.mjs";
const policy = {
  repository: "example-org/example-repo",
  baseBranch: "main",
  branchPrefix: "assistant/",
  readablePaths: ["."],
  writablePaths: ["src"],
  protectedPaths: [],
  checks: [],
};
function fixture({ failClone = false, failAuthorization = false, failRevoke = false } = {}) {
  const policies = [],
    commands = [];
  let record = null;
  const sandbox = {
    setNetworkPolicy: async (p) => {
      policies.push(p);
      if (failRevoke && policies.length > 1) throw Error("provider private info");
    },
    removePath: async () => {},
    run: async (input) => {
      commands.push(input.command);
      if (input.command.includes("clone") && failClone)
        return { exitCode: 1, stdout: "", stderr: "private failure" };
      return { exitCode: 0, stdout: "a".repeat(40), stderr: "" };
    },
    readTextFile: async () => null,
    readBinaryFile: async () => null,
  };
  const services = {
    store: {
      withLease: async (_, __, callback) => callback("fence"),
      loadRun: async () => null,
      saveRun: async () => {},
      loadWorkspace: async () => record,
      saveWorkspace: async (_, value) => {
        record = value;
      },
      assertFence: async () => {},
    },
    authorizeRepository: async () => {
      if (failAuthorization) throw Error("authorization failed");
      policies.push("repository-scoped");
    },
    ticket: async () => ({ reference: "TASK-1" }),
    reviewer: async () => {
      throw Error("not configured");
    },
    drafts: {
      find: async () => null,
      create: async () => ({ url: "https://example.com/draft/1" }),
    },
  };
  const host = createGitHubHost({
    services,
    nodeExecutable: "/usr/bin/node",
    gitExecutable: "/usr/bin/git",
    commitIdentity: { name: "Example contributor", email: "contributor@example.com" },
    checks: () => ({}),
  });
  return { host, sandbox, policies, commands, getRecord: () => record };
}
test("clone uses exact configured repo/base and closes network before returning", async () => {
  const f = fixture();
  await f.host.workspace("run-1", policy, "assistant/task-1", true, f.sandbox);
  assert.equal(f.policies.at(-1), "deny-all");
  assert.ok(f.commands.some((c) => c.includes("--branch")));
  assert.ok(f.commands.some((c) => c.includes("https://github.com/example-org/example-repo.git")));
  assert.ok(f.getRecord().baseCommit === "a".repeat(40));
  assert.ok(!f.commands.join("").includes("synthetic-token"));
});
for (const flag of ["failClone", "failAuthorization"])
  test(flag + " revokes access and returns no raw provider logs", async () => {
    const f = fixture({ [flag]: true });
    await assert.rejects(f.host.workspace("run-1", policy, "assistant/task-1", true, f.sandbox));
    assert.equal(f.policies.at(-1), "deny-all");
    assert.equal(f.getRecord(), null);
  });
test("network revocation failure stops development", async () => {
  const f = fixture({ failRevoke: true });
  await assert.rejects(f.host.workspace("run-1", policy, "assistant/task-1", true, f.sandbox));
  assert.equal(f.getRecord(), null);
});
test("missing durable workspace, unsafe repo and detached publication fail closed", async () => {
  const f = fixture();
  await assert.rejects(f.host.workspace("run-1", policy, "assistant/task-1", false, f.sandbox));
  await assert.rejects(
    f.host.workspace(
      "run-1",
      { ...policy, repository: "../other" },
      "assistant/task-1",
      true,
      f.sandbox
    )
  );
  await assert.rejects(
    f.host.publishDraft({
      runId: "r",
      fence: "f",
      repository: policy.repository,
      baseBranch: "main",
      branch: "assistant/task-1",
      ticket: "TASK-1",
      fingerprint: "a".repeat(64),
    }),
    /workspace/
  );
});
