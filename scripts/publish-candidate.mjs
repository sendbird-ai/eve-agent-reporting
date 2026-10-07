import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
const exec = promisify(execFile);
const tag = process.env.GITHUB_REF_NAME;
const match = tag?.match(
  /^(?:(developer|messaging|quality|fleet)-)?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/
);
if (!match) throw Error("Release requires an exact package/version tag");
if (!process.env.PUBLIC_AUDIT_CONFIG_JSON)
  throw Error("Private release audit configuration is required");
const temporary = await mkdtemp(join(tmpdir(), "agent-release-"));
try {
  const config = join(temporary, "audit.json");
  await writeFile(config, process.env.PUBLIC_AUDIT_CONFIG_JSON, { mode: 0o600 });
  const manifest = JSON.parse(await readFile(".artifacts/manifest.json", "utf8"));
  const name = "@bshaan77/eve-agent-" + (match[1] ?? "reporting");
  const item = manifest.packages.find((p) => p.name === name && p.version === match[2]);
  if (!item) throw Error("Tag does not match candidate manifest");
  const tarball = join(".artifacts", item.filename);
  const bytes = await readFile(tarball);
  if (createHash("sha256").update(bytes).digest("hex") !== item.sha256)
    throw Error("Candidate checksum changed");
  await exec("tar", ["-xzf", tarball, "-C", temporary]);
  await exec(process.execPath, ["scripts/audit-public.mjs", ".", "--config=" + config]);
  await exec(process.execPath, [
    "scripts/audit-public.mjs",
    join(temporary, "package"),
    "--artifact",
    "--config=" + config,
  ]);
  await exec("npm", ["publish", tarball, "--access", "public"]);
  process.stdout.write(
    JSON.stringify({ name, version: item.version, sha256: item.sha256, published: true }) + "\n"
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
