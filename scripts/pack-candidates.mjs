import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const exec = promisify(execFile);
const destination = resolve(process.argv[2] ?? ".artifacts");
await mkdir(destination, { recursive: true });
const packages = [
  ".",
  "packages/developer",
  "packages/messaging",
  "packages/quality",
  "packages/fleet",
];
const records = [];
for (const directory of packages) {
  const { stdout } = await exec("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: resolve(directory),
    maxBuffer: 2000000,
  });
  const parsed = JSON.parse(stdout);
  const metadata = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const path = join(destination, metadata.filename);
  const bytes = await readFile(path);
  const unpacked = await mkdtemp(join(tmpdir(), "agent-artifact-"));
  try {
    await exec("tar", ["-xzf", path, "-C", unpacked]);
    const config = process.env.PUBLIC_AUDIT_CONFIG;
    const { stdout: auditOutput } = await exec(
      process.execPath,
      [
        "scripts/audit-public.mjs",
        join(unpacked, "package"),
        "--artifact",
        ...(config ? ["--config=" + config] : []),
      ],
      { cwd: process.cwd() }
    );
    records.push({
      name: metadata.name,
      version: metadata.version,
      filename: metadata.filename,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: metadata.integrity,
      audit: { ...JSON.parse(auditOutput), includesGeneratedFiles: true },
    });
  } finally {
    await rm(unpacked, { recursive: true, force: true });
  }
}
const { stdout: revision } = await exec("git", ["rev-parse", "HEAD"]);
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(
    { schemaVersion: 1, sourceCommit: revision.trim(), packages: records, published: false },
    null,
    2
  ) + "\n"
);
process.stdout.write(
  JSON.stringify({
    packages: records.length,
    manifest: join(destination, "manifest.json"),
    published: false,
  }) + "\n"
);
