import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as exec } from "node:child_process";
import { promisify } from "node:util";
import { createDeveloper } from "../dist/extension/lib/core.mjs";
import { createGitHubHost } from "../dist/extension/lib/github-host.mjs";
const execFile = promisify(exec);
test("shared GitHub plumbing executes local clone/edit/check/commit and recovers an idempotent draft after lost acknowledgement", async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "github-workflow-")));
  const origin = join(temp, "origin"),
    workspaces = join(temp, "workspaces");
  const commands = [],
    network = [];
  try {
    await mkdir(join(origin, "src"), { recursive: true });
    await writeFile(join(origin, "src/main.txt"), "old");
    for (const args of [
      ["init", "-b", "main"],
      ["add", "."],
      [
        "-c",
        "user.name=Example",
        "-c",
        "user.email=contributor@example.com",
        "commit",
        "-m",
        "initial",
      ],
    ])
      await execFile("/usr/bin/git", args, { cwd: origin });
    const physical = (path) => path.replace("/workspace/repositories", workspaces);
    const sandbox = {
      setNetworkPolicy: async (policy) => network.push(policy),
      removePath: async ({ path }) => rm(physical(path), { recursive: true, force: true }),
      run: async ({ command, workingDirectory }) => {
        commands.push(command);
        if (command.includes("push --")) return { exitCode: 0, stdout: "", stderr: "" };
        const local = physical(command).replace(
          "https://github.com/example-org/example-repo.git",
          "file://" + origin
        );
        try {
          const result = await execFile("/bin/sh", ["-c", local], {
            cwd: workingDirectory ? physical(workingDirectory) : temp,
          });
          return { ...result, exitCode: 0 };
        } catch (error) {
          return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr };
        }
      },
      readTextFile: async ({ path }) => {
        try {
          return await readFile(physical(path), "utf8");
        } catch (error) {
          if (error.code === "ENOENT") return null;
          throw error;
        }
      },
      readBinaryFile: async ({ path }) => {
        try {
          return await readFile(physical(path));
        } catch (error) {
          if (error.code === "ENOENT") return null;
          throw error;
        }
      },
      writeTextFile: async ({ path, content }) => writeFile(physical(path), content),
    };
    let run = null,
      record = null,
      draft = null,
      creates = 0,
      loseAcknowledgement = true;
    const services = {
      store: {
        withLease: async (_, __, callback) => callback("fence-1"),
        loadRun: async () => structuredClone(run),
        saveRun: async (_, value) => {
          if (value.publication && loseAcknowledgement) {
            loseAcknowledgement = false;
            throw Error("simulated lost write acknowledgement");
          }
          run = structuredClone(value);
        },
        loadWorkspace: async () => structuredClone(record),
        saveWorkspace: async (_, value) => {
          record = structuredClone(value);
        },
        assertFence: async (_, __, fence) => assert.equal(fence, "fence-1"),
      },
      authorizeRepository: async (_, repo) => {
        assert.equal(repo, "example-org/example-repo");
        network.push("scoped-auth");
      },
      ticket: async (input) => {
        assert.equal(input.destination, "project-a");
        return { reference: "TASK-1" };
      },
      reviewer: async (input) => {
        assert.ok(input.diff.patch.includes("+new"));
        return {
          verdict: "approve",
          model: "review-model",
          modelFamily: "family-b",
          provider: "synthetic",
          fallback: false,
          artifact: "review:1",
        };
      },
      drafts: {
        find: async () => draft,
        create: async (input) => {
          assert.equal(input.draft, true);
          assert.match(input.headCommit, /^[a-f0-9]{40}$/);
          creates++;
          draft = { url: "https://example.com/draft/1" };
          return draft;
        },
      },
    };
    const makeHost = () => {
      const host = createGitHubHost({
        services,
        nodeExecutable: process.execPath,
        gitExecutable: "/usr/bin/git",
        commitIdentity: { name: "Example contributor", email: "contributor@example.com" },
        checks: () => ({
          test: {
            command: `${process.execPath} -e 'require("node:assert/strict").equal(require("node:fs").readFileSync("src/main.txt","utf8"),"new")'`,
            parse: (r) => ({
              exitCode: r.exitCode,
              assertionsPassed: r.exitCode === 0 ? 1 : 0,
              assertionsFailed: r.exitCode !== 0 ? 1 : 0,
              setupFailed: false,
              artifact: "test:1",
            }),
          },
        }),
      });
      return { ...host, workspace: (...args) => host.workspace(...args, sandbox) };
    };
    const policy = {
      repositories: [
        {
          repository: "example-org/example-repo",
          baseBranch: "main",
          branchPrefix: "assistant/",
          readablePaths: ["."],
          writablePaths: ["src"],
          protectedPaths: [],
          checks: ["test"],
        },
      ],
      developerModel: "openai/gpt-5.4",
      developerModelFamily: "family-a",
      reviewModel: "review-model",
      requireIndependentReview: true,
      ticketDestination: "project-a",
      maxFileBytes: 10000,
    };
    const engine = createDeveloper(policy, makeHost());
    await engine.initialize("run-1", {
      repository: "example-org/example-repo",
      branch: "assistant/task-1",
      mode: "develop",
    });
    await engine.ticket("run-1", { title: "Scoped edit", description: "Synthetic acceptance" });
    await engine.edit("run-1", { path: "src/main.txt", oldText: "old", newText: "new" });
    await engine.checks("run-1");
    await engine.review("run-1");
    await assert.rejects(engine.publish("run-1"), /lost write/);
    const recovered = createDeveloper(policy, makeHost());
    assert.deepEqual(await recovered.publish("run-1"), { url: "https://example.com/draft/1" });
    assert.equal(creates, 1);
    assert.equal(commands.filter((c) => c.includes("push --")).length, 1);
    assert.ok(
      commands
        .find((c) => c.includes("push --"))
        .includes(record.preparedHead + ":refs/heads/assistant/task-1")
    );
    assert.equal(network.at(-1), "deny-all");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
