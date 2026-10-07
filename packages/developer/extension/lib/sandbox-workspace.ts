import { createHash } from "node:crypto";
import type { SandboxSession } from "eve/sandbox";
import type { CheckResult, Workspace } from "./core.js";
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
/** No task-provided shell execution. Commands and evidence parsers are trusted host bindings. */
export function createSandboxWorkspace(options: {
  sandbox: SandboxSession;
  root: string;
  baseCommit: string;
  nodeExecutable: string;
  gitExecutable: string;
  checks: Record<
    string,
    {
      command: string;
      parse(result: { exitCode: number; stdout: string; stderr: string }): CheckResult;
    }
  >;
}): Workspace {
  const { sandbox, root, baseCommit, nodeExecutable, gitExecutable, checks } = options;
  if (
    !root.startsWith("/") ||
    root.endsWith("/") ||
    root.includes("//") ||
    root.split("/").some((p) => p === ".." || p === ".") ||
    !/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(baseCommit) ||
    ![nodeExecutable, gitExecutable].every((p) => p.startsWith("/") && !/[\r\n\x00]/.test(p))
  )
    throw new TypeError("Invalid sandbox workspace binding");
  async function run(command: string) {
    const result = await sandbox.run({ command, workingDirectory: root });
    if (result.exitCode !== 0) throw new Error("Sandbox inspection failed");
    return result.stdout;
  }
  const git = (args: string) =>
    run(`${quote(gitExecutable)} -c core.hooksPath=/dev/null -c core.fsmonitor=false ${args}`);
  async function canonicalPath(path: string): Promise<string> {
    const source = `const fs=require('node:fs'),p=require('node:path');const root=${JSON.stringify(root)},rel=${JSON.stringify(path)};if(fs.realpathSync(root)!==root)throw Error();let current=root;for(const part of rel.split('/')){if(!part||part==='.'||part==='..'||part.includes('\\\\'))throw Error();current=p.join(current,part);try{if(fs.lstatSync(current).isSymbolicLink())throw Error('link')}catch(e){if(e.code!=='ENOENT')throw e}}if(!current.startsWith(root+'/'))throw Error();process.stdout.write(p.relative(root,current));`;
    return run(`${quote(nodeExecutable)} -e ${quote(source)}`);
  }
  async function diff() {
    // Include staged and unstaged changes against the trusted base, plus all untracked files.
    const changed = (await git(`diff --name-only -z --no-renames ${quote(baseCommit)} --`))
      .split("\0")
      .filter(Boolean);
    const untracked = (await git("ls-files --others --exclude-standard -z"))
      .split("\0")
      .filter(Boolean);
    const files = [];
    const digest = createHash("sha256");
    let patch = await git(
      `diff --no-ext-diff --no-textconv --no-renames --binary ${quote(baseCommit)} --`
    );
    digest.update(baseCommit);
    for (const path of [...new Set([...changed, ...untracked])].sort()) {
      let symlink = false;
      try {
        await canonicalPath(path);
      } catch {
        symlink = true;
      }
      files.push({ path, symlink });
      digest.update("\0" + path + "\0" + String(symlink));
      // Content/mode hashing stays stable when identical untracked files are staged or committed.
      if (!symlink) {
        const bytes = await sandbox.readBinaryFile({ path: root + "/" + path });
        const statSource = `const fs=require('node:fs');try{process.stdout.write(String(fs.lstatSync(${JSON.stringify(root + "/" + path)}).mode & 511))}catch(e){if(e.code!=='ENOENT')throw e;process.stdout.write('deleted')}`;
        const mode = await run(`${quote(nodeExecutable)} -e ${quote(statSource)}`);
        digest.update("\0" + mode + "\0");
        digest.update(bytes ?? "deleted");
        if (untracked.includes(path) && bytes !== null) {
          let rendered: string;
          try {
            rendered = new TextDecoder("utf-8", { fatal: true })
              .decode(bytes)
              .split("\n")
              .map((line) => "+" + line)
              .join("\n");
          } catch {
            rendered = "Binary content SHA256 " + createHash("sha256").update(bytes).digest("hex");
          }
          patch += `\ndiff --git ${JSON.stringify("a/" + path)} ${JSON.stringify("b/" + path)}\nnew file\n${rendered}\n`;
        }
      }
    }
    return { fingerprint: digest.digest("hex"), files, patch };
  }
  async function read(path: string) {
    await canonicalPath(path);
    return sandbox.readTextFile({ path: root + "/" + path });
  }
  return {
    canonicalPath,
    read,
    async write(path, content) {
      await canonicalPath(path);
      await sandbox.writeTextFile({ path: root + "/" + path, content });
    },
    async list() {
      return (await git("ls-files -z --cached --others --exclude-standard"))
        .split("\0")
        .filter(Boolean);
    },
    diff,
    async runCheck(id) {
      const check = checks[id];
      if (!check) throw new Error("Check not configured");
      const result = await sandbox.run({ command: check.command, workingDirectory: root });
      return check.parse(result);
    },
    async context() {
      const instructions =
        (await read("AGENTS.md")) ??
        (await read("CLAUDE.md")) ??
        "No repository instructions found";
      const skills = [];
      for (const path of await this.list())
        if (/^\.agents\/skills\/.+\/SKILL\.md$/.test(path)) {
          const text = await read(path);
          if (text !== null)
            skills.push({
              path,
              description: text.match(/^description:\s*(.+)$/m)?.[1] ?? "Read the skill before use",
            });
        }
      return { instructions, skills };
    },
  };
}
