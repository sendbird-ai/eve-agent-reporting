import { createHash } from "node:crypto";
import type { VercelSandboxSession } from "eve/sandbox/vercel";
import type { DeveloperHost, RepositoryPolicy, RunRecord, Workspace } from "./core.js";
import { createSandboxWorkspace } from "./sandbox-workspace.js";
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
interface WorkspaceRecord {
  root: string;
  baseCommit: string;
  preparedHead?: string;
  preparedFingerprint?: string;
}
export interface GitHubHostServices {
  store: {
    withLease: DeveloperHost["withLease"];
    loadRun(runId: string): Promise<RunRecord | null>;
    saveRun(runId: string, record: RunRecord): Promise<void>;
    loadWorkspace(runId: string): Promise<WorkspaceRecord | null>;
    saveWorkspace(runId: string, record: WorkspaceRecord): Promise<void>;
    assertFence(repository: string, runId: string, fence: string): Promise<void>;
  };
  /** Apply path/repository-scoped firewall credentials. Never put tokens in process args/env/files.
   * The shared adapter always restores deny-all in finally, including authorization failures. */
  authorizeRepository(
    sandbox: VercelSandboxSession,
    repository: string,
    operation: "clone" | "push"
  ): Promise<void>;
  ticket: DeveloperHost["createTicket"];
  reviewer: DeveloperHost["review"];
  drafts: {
    /** Must return only the matching run marker AND current head commit, not any PR on that branch. */
    find(input: {
      repository: string;
      head: string;
      base: string;
      idempotencyKey: string;
      headCommit: string;
    }): Promise<{ url: string } | null>;
    create(input: {
      repository: string;
      head: string;
      base: string;
      idempotencyKey: string;
      headCommit: string;
      ticket: string;
      draft: true;
    }): Promise<{ url: string }>;
  };
}
export interface GitHubHostOptions {
  services: GitHubHostServices;
  nodeExecutable: string;
  gitExecutable: string;
  commitIdentity: { name: string; email: string };
  /** Commands and structured parsers from reviewed private configuration, per repository. */
  checks(repository: string): Parameters<typeof createSandboxWorkspace>[0]["checks"];
}
/** Shared GitHub clone/check/draft plumbing. Live provider/service validation remains a host gate. */
export function createGitHubHost(options: GitHubHostOptions): DeveloperHost {
  const { services, gitExecutable, nodeExecutable, commitIdentity } = options;
  if (
    !commitIdentity.name ||
    !commitIdentity.email ||
    /[\r\n\x00]/.test(commitIdentity.name + commitIdentity.email) ||
    ![gitExecutable, nodeExecutable].every((p) => p.startsWith("/") && !/[\r\n\x00]/.test(p))
  )
    throw new TypeError("Invalid GitHub host configuration");
  const contexts = new WeakMap<
    Workspace,
    { sandbox: VercelSandboxSession; record: WorkspaceRecord; policy: Readonly<RepositoryPolicy> }
  >();
  async function git(sandbox: VercelSandboxSession, args: string, root?: string) {
    const result = await sandbox.run({
      command: `${quote(gitExecutable)} -c core.hooksPath=/dev/null -c core.fsmonitor=false -c commit.gpgsign=false -c credential.helper= ${args}`,
      ...(root ? { workingDirectory: root } : {}),
    });
    if (result.exitCode !== 0) throw new Error("Git operation failed");
    return result.stdout.trim();
  }
  async function network<T>(
    sandbox: VercelSandboxSession,
    repository: string,
    operation: "clone" | "push",
    callback: () => Promise<T>
  ): Promise<T> {
    try {
      await sandbox.setNetworkPolicy("deny-all");
      await services.authorizeRepository(sandbox, repository, operation);
      return await callback();
    } catch {
      throw new Error("Repository access operation failed");
    } finally {
      try {
        await sandbox.setNetworkPolicy("deny-all");
      } catch {
        throw new Error("Failed to revoke repository network access; stop development");
      }
    }
  }
  return {
    withLease: (...args) => services.store.withLease(...args),
    loadRun: (id) => services.store.loadRun(id),
    saveRun: (id, record) => services.store.saveRun(id, record),
    async workspace(runId, policy, branch, initialize, sandboxSession) {
      if (
        !sandboxSession ||
        typeof (sandboxSession as VercelSandboxSession).setNetworkPolicy !== "function"
      )
        throw new Error("Vercel network-capable sandbox required");
      if (
        !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(policy.repository) ||
        !branch.startsWith(policy.branchPrefix)
      )
        throw new Error("Repository or branch exceeds configured policy");
      const sandbox = sandboxSession as VercelSandboxSession;
      let record = await services.store.loadWorkspace(runId);
      if (initialize && !record) {
        const root = "/workspace/repositories/" + createHash("sha256").update(runId).digest("hex");
        await sandbox.setNetworkPolicy("deny-all");
        await sandbox.removePath({ path: root, recursive: true, force: true });
        const mkdir = await sandbox.run({
          command: `${quote(nodeExecutable)} -e ${quote("require('node:fs').mkdirSync('/workspace/repositories',{recursive:true})")}`,
        });
        if (mkdir.exitCode !== 0) throw new Error("Sandbox workspace preparation failed");
        await network(sandbox, policy.repository, "clone", () =>
          git(
            sandbox,
            `clone --depth 50 --branch ${quote(policy.baseBranch)} -- https://github.com/${policy.repository}.git ${quote(root)}`
          )
        );
        await git(sandbox, `checkout -b ${quote(branch)}`, root);
        record = { root, baseCommit: await git(sandbox, "rev-parse HEAD", root) };
        await services.store.saveWorkspace(runId, record);
      }
      if (!record) throw new Error("Durable workspace record missing");
      const workspace = createSandboxWorkspace({
        sandbox,
        root: record.root,
        baseCommit: record.baseCommit,
        nodeExecutable,
        gitExecutable,
        checks: options.checks(policy.repository),
      });
      const runCheck = workspace.runCheck;
      // Configured checks never retain publication credentials or authenticated egress.
      workspace.runCheck = async (id) => {
        await sandbox.setNetworkPolicy("deny-all");
        try {
          return await runCheck(id);
        } finally {
          await sandbox.setNetworkPolicy("deny-all");
        }
      };
      contexts.set(workspace, { sandbox, record, policy });
      return workspace;
    },
    createTicket: (input) => services.ticket(input),
    review: (input) => services.reviewer(input),
    async publishDraft(input, workspace) {
      const context = workspace && contexts.get(workspace);
      if (!context || !workspace) throw new Error("Active scoped workspace required");
      const { sandbox, record, policy } = context;
      if (policy.repository !== input.repository || policy.baseBranch !== input.baseBranch)
        throw new Error("Publication policy mismatch");
      await sandbox.setNetworkPolicy("deny-all");
      const branch = await git(sandbox, "branch --show-current", record.root);
      const head = await git(sandbox, "rev-parse HEAD", record.root);
      if (branch !== input.branch || head !== (record.preparedHead ?? record.baseCommit))
        throw new Error("Unexpected branch or unreviewed commit history");
      if ((await workspace.diff()).fingerprint !== input.fingerprint)
        throw new Error("Publication diff changed");
      await services.store.assertFence(input.repository, input.runId, input.fence);
      if (!record.preparedHead) {
        await git(sandbox, "add --all -- .", record.root);
        if ((await workspace.diff()).fingerprint !== input.fingerprint)
          throw new Error("Staging changed reviewed content");
        await git(
          sandbox,
          `-c user.name=${quote(commitIdentity.name)} -c user.email=${quote(commitIdentity.email)} commit -m ${quote("Implement " + input.ticket)}`,
          record.root
        );
        record.preparedHead = await git(sandbox, "rev-parse HEAD", record.root);
        if (
          (await git(sandbox, `rev-parse ${quote(record.preparedHead + "^")}`, record.root)) !==
          record.baseCommit
        )
          throw new Error("Unexpected commit ancestry");
        record.preparedFingerprint = input.fingerprint;
        await services.store.saveWorkspace(input.runId, record);
      }
      if (
        (await workspace.diff()).fingerprint !== input.fingerprint ||
        (await git(
          sandbox,
          `diff --no-ext-diff --no-textconv --binary ${quote(record.preparedHead!)} --`,
          record.root
        ))
      )
        throw new Error("Prepared commit differs from working tree");
      if (record.preparedFingerprint !== input.fingerprint)
        throw new Error("Prepared commit differs from review");
      const idempotencyKey = createHash("sha256").update(input.runId).digest("hex");
      const target = {
        repository: input.repository,
        head: input.branch,
        base: input.baseBranch,
        idempotencyKey,
        headCommit: record.preparedHead!,
      };
      const existing = await services.drafts.find(target);
      if (existing) return existing;
      await network(sandbox, input.repository, "push", async () => {
        await services.store.assertFence(input.repository, input.runId, input.fence);
        // Explicit URL/ref, never a repository-supplied pushurl; never force or merge.
        await git(
          sandbox,
          `push -- https://github.com/${input.repository}.git ${quote(record.preparedHead! + ":refs/heads/" + input.branch)}`,
          record.root
        );
      });
      await services.store.assertFence(input.repository, input.runId, input.fence);
      return services.drafts.create({ ...target, ticket: input.ticket, draft: true });
    },
  };
}
