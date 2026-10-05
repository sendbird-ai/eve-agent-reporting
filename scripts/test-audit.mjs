import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
test("actual file audit rejects synthetic private content without printing it; exact provenance is narrow", async () => {
  const temp = await mkdtemp(join(tmpdir(), "public-audit-"));
  const identifier = ["synthetic", "private", "tenant"].join("-");
  const config = join(tmpdir(), `public-audit-${Date.now()}.json`);
  try {
    await writeFile(join(temp, "instructions.md"), identifier);
    await writeFile(
      config,
      JSON.stringify({ forbiddenTerms: [identifier], metadataAllowlist: [] })
    );
    await assert.rejects(
      exec(process.execPath, ["scripts/audit-public.mjs", temp, "--config=" + config]),
      (error) =>
        error.code === 1 && !error.stdout.includes(identifier) && !error.stderr.includes(identifier)
    );
    await rm(join(temp, "instructions.md"));
    const url = `https://example.com/${identifier}`;
    await writeFile(join(temp, "package.json"), JSON.stringify({ repository: { url } }));
    await writeFile(
      config,
      JSON.stringify({
        forbiddenTerms: [identifier],
        metadataAllowlist: [{ file: "package.json", field: "repository.url", value: url }],
      })
    );
    const { stdout } = await exec(process.execPath, [
      "scripts/audit-public.mjs",
      temp,
      "--config=" + config,
    ]);
    assert.equal(JSON.parse(stdout).findings, 0);
    await writeFile(join(temp, "prompt.md"), identifier);
    await assert.rejects(
      exec(process.execPath, ["scripts/audit-public.mjs", temp, "--config=" + config]),
      (error) => error.code === 1
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(config, { force: true });
  }
});

test("artifact audit inspects generated dist files and blocks forbidden content", async () => {
  const temp = await mkdtemp(join(tmpdir(), "artifact-audit-"));
  const identifier = ["synthetic", "private", "artifact"].join("-");
  const config = join(tmpdir(), `artifact-audit-${Date.now()}.json`);
  try {
    await mkdir(join(temp, "dist"));
    await writeFile(join(temp, "dist/generated.mjs"), identifier);
    await writeFile(
      config,
      JSON.stringify({ forbiddenTerms: [identifier], metadataAllowlist: [] })
    );
    await assert.rejects(
      exec(process.execPath, [
        "scripts/audit-public.mjs",
        temp,
        "--artifact",
        "--config=" + config,
      ]),
      (error) =>
        error.code === 1 && !error.stdout.includes(identifier) && !error.stderr.includes(identifier)
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(config, { force: true });
  }
});
