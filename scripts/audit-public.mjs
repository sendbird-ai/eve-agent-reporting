import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { auditText } from "../packages/quality/dist/index.js";
const args = process.argv.slice(2);
const configPath = args.find((arg) => arg.startsWith("--config="))?.slice(9);
const artifact = args.includes("--artifact");
const roots = args.filter((arg) => !arg.startsWith("--"));
if (!roots.length) throw new Error("Provide source or unpacked artifact directories");
let config;
try {
  config = configPath
    ? JSON.parse(await readFile(configPath, "utf8"))
    : { forbiddenTerms: [], metadataAllowlist: [] };
} catch {
  throw new Error("Invalid audit configuration");
}

if (!Array.isArray(config.forbiddenTerms) || !Array.isArray(config.metadataAllowlist))
  throw new Error("Invalid audit configuration");
const allowedFields = new Set(["repository.url", "bugs.url", "homepage"]);
for (const entry of config.metadataAllowlist)
  if (
    !entry.file.endsWith("package.json") ||
    !allowedFields.has(entry.field) ||
    typeof entry.value !== "string"
  )
    throw new Error("Only exact reviewed package provenance fields may be exempted");
const excluded = new Set(
  artifact ? [] : ["node_modules", ".git", "dist", ".eve", ".output", ".artifacts"]
);
let scanned = 0,
  findings = 0;
async function walk(root, path = root) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("Audit input contains a symlink; inspect it explicitly");
    if (entry.isDirectory()) {
      if (!excluded.has(entry.name)) await walk(root, full);
      continue;
    }
    const info = await stat(full);
    if (info.size > 5000000) throw new Error("Audit file exceeds size limit");
    let text = await readFile(full, "utf8");
    const name = relative(root, full).replaceAll("\\", "/");
    if (entry.name === "package.json") {
      let metadata;
      try {
        metadata = JSON.parse(text);
      } catch {
        throw new Error("Invalid package metadata");
      }
      for (const exception of config.metadataAllowlist.filter((e) => e.file === name)) {
        const parts = exception.field.split(".");
        let object = metadata;
        for (const part of parts.slice(0, -1)) object = object?.[part];
        if (object?.[parts.at(-1)] === exception.value)
          object[parts.at(-1)] = "[reviewed provenance]";
      }
      text = JSON.stringify(metadata);
    }
    const result = auditText(text, config.forbiddenTerms);
    scanned++;
    if (result.length) {
      findings += result.length;
      process.stderr.write(
        JSON.stringify({ fileIndex: scanned, rules: [...new Set(result.map((f) => f.rule))] }) +
          "\n"
      );
    }
  }
}
for (const root of roots) await walk(root);
process.stdout.write(
  JSON.stringify({
    scanned,
    findings,
    privateDenylistSupplied: Boolean(configPath),
    manualReviewRequired: true,
  }) + "\n"
);
if (findings) process.exitCode = 1;
