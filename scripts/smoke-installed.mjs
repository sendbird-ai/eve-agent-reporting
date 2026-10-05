import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const exec = promisify(execFile);
const artifacts = resolve(process.argv[2] ?? ".artifacts");
const manifest = JSON.parse(await readFile(join(artifacts, "manifest.json"), "utf8"));
const paths = Object.fromEntries(
  manifest.packages.map((p) => [p.name, join(artifacts, p.filename)])
);
const temporary = await mkdtemp(join(tmpdir(), "agent-installed-"));
async function run(command, args, cwd) {
  return exec(command, args, { cwd, maxBuffer: 20000000, env: process.env });
}
async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await files(full)));
    else result.push(full);
  }
  return result;
}
try {
  const reporting = join(temporary, "reporting");
  await mkdir(reporting);
  await writeFile(
    join(reporting, "package.json"),
    JSON.stringify({ name: "reporting-fixture", private: true, type: "module" })
  );
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      paths["@bshaan77/eve-agent-reporting"],
    ],
    reporting
  );
  await writeFile(
    join(reporting, "verify.mjs"),
    `import assert from 'node:assert/strict';import {createReportingClient} from '@bshaan77/eve-agent-reporting';import {existsSync} from 'node:fs';assert.equal(existsSync('node_modules/eve'),false);let sent;const client=createReportingClient({baseUrl:'https://reports.example.com/api/agents',token:'synthetic-token',fetch:async(_,init)=>{sent=JSON.parse(init.body);return new Response(null,{status:204})}});await client.reportInboundEvent({slug:'support-assistant',slackUserId:'U123ABC',channelId:'C123ABC',sessionTurnKey:'turn:1'});assert.equal(sent.sessionTurnKey,'turn:1');`
  );
  await run(process.execPath, ["verify.mjs"], reporting);
  const results = [];
  for (const [name, repository, baseBranch, writablePaths, destination] of [
    ["support", "example-org/example-repo", "main", ["src", "test"], "project-a"],
    ["operations", "other-org/other-repo", "staging", ["apps/assistant"], "project-b"],
  ]) {
    const root = join(temporary, name);
    await mkdir(join(root, "agent/extensions"), { recursive: true });
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: `example-${name}-assistant`,
        private: true,
        type: "module",
        dependencies: {
          eve: "0.66.2",
          "@bshaan77/eve-agent-developer": `file:${paths["@bshaan77/eve-agent-developer"]}`,
        },
      })
    );
    await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], root);
    await cp("examples/developer-consumer/bindings.ts", join(root, "src/bindings.ts"));
    await writeFile(
      join(root, "agent/instructions.md"),
      "Delegate scoped repository tasks to the configured developer. Never merge or deploy."
    );
    await writeFile(
      join(root, "agent/agent.ts"),
      `import {defineAgent} from 'eve';export default defineAgent({model:'openai/gpt-5.4'});`
    );
    const policy = {
      repositories: [
        {
          repository,
          baseBranch,
          branchPrefix: "assistant/",
          readablePaths: ["."],
          writablePaths,
          protectedPaths: [],
          checks: ["test"],
        },
      ],
      developerModel: "openai/gpt-5.4",
      developerModelFamily: "openai",
      reviewModel: "configured-review-model",
      requireIndependentReview: true,
      ticketDestination: destination,
      maxFileBytes: 100000,
    };
    await writeFile(
      join(root, "agent/extensions/development.ts"),
      `import developer from '@bshaan77/eve-agent-developer';import {bindings} from '../../src/bindings';export default developer({policy:${JSON.stringify(policy)},bindings});`
    );
    await run(
      process.execPath,
      ["node_modules/eve/bin/eve.js", "build", "--skip-sandbox-prewarm"],
      root
    );
    // Inspect compiler artifacts, not just the npm file list. Fail if assets/tools/config were lost.
    const generated = [
      ...(await files(join(root, ".eve"))),
      ...(await files(join(root, ".output"))),
    ];
    const text = (
      await Promise.all(
        generated.filter((f) => /\.(?:json|js|mjs|md)$/.test(f)).map((f) => readFile(f, "utf8"))
      )
    ).join("\n");
    assert.ok(text.includes("development__developer"), "compiled subagent missing");
    assert.ok(text.includes("publish_draft"), "compiled developer tool missing");
    assert.ok(text.includes("Scoped developer"), "instructions missing");
    assert.ok(text.includes(destination), "private mount configuration missing");
    assert.ok(
      text.includes("Supply reviewed production host bindings"),
      "host callbacks were lost"
    );
    results.push({
      consumer: name,
      compiled: true,
      sandboxPrewarm: "skipped",
      liveProviderExercise: false,
    });
  }
  await writeFile(
    join(artifacts, "installed-smoke.json"),
    JSON.stringify(
      { node: process.version, eve: "0.66.2", reportingWithoutSdk: true, consumers: results },
      null,
      2
    ) + "\n"
  );
  process.stdout.write(JSON.stringify({ reportingWithoutSdk: true, consumers: results }) + "\n");
} finally {
  if (process.env.KEEP_SMOKE_FIXTURES) process.stdout.write("Fixture path: " + temporary + "\n");
  else await rm(temporary, { recursive: true, force: true });
}
