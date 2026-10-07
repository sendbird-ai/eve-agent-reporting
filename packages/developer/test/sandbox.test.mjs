import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as exec } from "node:child_process";
import { promisify } from "node:util";
import { createSandboxWorkspace } from "../dist/extension/lib/sandbox-workspace.mjs";
const execFile = promisify(exec);
test("real filesystem/git sandbox adapter rejects symlink escape and fingerprints untracked content", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "component-workspace-")));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/main.ts"), "old\n");
    for (const args of [
      ["init"],
      ["add", "."],
      [
        "-c",
        "user.name=Example",
        "-c",
        "user.email=example@example.com",
        "commit",
        "-m",
        "initial",
      ],
    ])
      await execFile("/usr/bin/git", args, { cwd: root });
    const { stdout: base } = await execFile("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: root });
    const sandbox = {
      run: async ({ command, workingDirectory }) => {
        try {
          const { stdout, stderr } = await execFile("/bin/sh", ["-c", command], {
            cwd: workingDirectory,
          });
          return { exitCode: 0, stdout, stderr };
        } catch (e) {
          return { exitCode: e.code, stdout: e.stdout, stderr: e.stderr };
        }
      },
      readBinaryFile: async ({ path }) => {
        try {
          return await readFile(path);
        } catch (e) {
          if (e.code === "ENOENT") return null;
          throw e;
        }
      },
      readTextFile: async ({ path }) => {
        try {
          return await readFile(path, "utf8");
        } catch (e) {
          if (e.code === "ENOENT") return null;
          throw e;
        }
      },
      writeTextFile: async ({ path, content }) => writeFile(path, content),
    };
    const workspace = createSandboxWorkspace({
      sandbox,
      root,
      baseCommit: base.trim(),
      nodeExecutable: process.execPath,
      gitExecutable: "/usr/bin/git",
      checks: {},
    });
    assert.equal(await workspace.canonicalPath("src/new.ts"), "src/new.ts");
    await assert.rejects(workspace.canonicalPath("../outside"));
    await symlink("/private/tmp", join(root, "src/escape"));
    await assert.rejects(workspace.read("src/escape/private"));
    await writeFile(join(root, "src/new.ts"), "new implementation");
    const first = await workspace.diff();
    assert.ok(first.files.some((f) => f.path === "src/escape" && f.symlink));
    assert.ok(first.patch.includes("new implementation"));
    await execFile("/usr/bin/git", ["add", "src/new.ts"], { cwd: root });
    assert.equal((await workspace.diff()).fingerprint, first.fingerprint);

    await writeFile(join(root, "src/new.ts"), "different implementation");
    assert.notEqual((await workspace.diff()).fingerprint, first.fingerprint);
    await rm(join(root, "src/escape"));
    await writeFile(join(root, "src/main.ts"), "changed\n");
    const diff = await workspace.diff();
    assert.ok(diff.files.some((f) => f.path === "src/main.ts"));
    assert.ok(diff.patch.includes("+changed"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
