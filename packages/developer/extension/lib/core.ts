import type { SandboxSession } from "eve/sandbox";
export interface RepositoryPolicy {
  repository: string;
  baseBranch: string;
  branchPrefix: string;
  readablePaths: string[];
  writablePaths: string[];
  protectedPaths: string[];
  checks: string[];
}
export interface DeveloperPolicy {
  repositories: RepositoryPolicy[];
  developerModel: string;
  developerModelFamily: string;
  reviewModel: string;
  requireIndependentReview: boolean;
  ticketDestination: string;
  maxFileBytes: number;
}
export interface DiffSnapshot {
  fingerprint: string;
  files: { path: string; previousPath?: string; symlink: boolean }[];
  patch: string;
}
export interface CheckResult {
  exitCode: number;
  assertionsPassed: number;
  assertionsFailed: number;
  setupFailed: boolean;
  artifact: string;
}
export interface ReviewResult {
  verdict: "approve" | "needs-changes";
  model: string;
  modelFamily: string;
  provider: string;
  fallback: boolean;
  artifact: string;
}
export interface RunRecord {
  repository: string;
  branch: string;
  mode: "research" | "develop";
  ticket?: string;
  checks?: { fingerprint: string; results: Record<string, CheckResult> };
  review?: { fingerprint: string; result: ReviewResult };
  publication?: { url: string };
}
export interface Workspace {
  /** Canonical, root-relative path. Must resolve existing ancestors and reject symlinks; new files allowed. */
  canonicalPath(path: string): Promise<string>;
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  list(): Promise<string[]>;
  diff(): Promise<DiffSnapshot>;
  runCheck(checkId: string): Promise<CheckResult>;
  context(): Promise<{ instructions: string; skills: { path: string; description: string }[] }>;
}
export interface DeveloperHost {
  /** Atomic, durable per-repository lease. All instances share storage; callback fails on lost ownership.
   * The fence passed to publisher must be validated by the host at the publication boundary. */
  withLease<T>(
    repository: string,
    runId: string,
    callback: (fence: string) => Promise<T>
  ): Promise<T>;
  loadRun(runId: string): Promise<RunRecord | null>;
  saveRun(runId: string, record: RunRecord): Promise<void>;
  /** Clone/reset only on initialize; subsequent calls reopen the same durable workspace. */
  workspace(
    runId: string,
    policy: Readonly<RepositoryPolicy>,
    branch: string,
    initialize: boolean,
    sandbox?: SandboxSession
  ): Promise<Workspace>;
  createTicket(input: {
    destination: string;
    runId: string;
    title: string;
    description: string;
  }): Promise<{ reference: string }>;
  review(input: {
    model: string;
    diff: DiffSnapshot;
    checks: Record<string, CheckResult>;
  }): Promise<ReviewResult>;
  /** Always draft, fenced and idempotent by runId. No merge or deploy capability is supplied. */
  publishDraft(
    input: {
      runId: string;
      fence: string;
      repository: string;
      baseBranch: string;
      branch: string;
      ticket: string;
      fingerprint: string;
    },
    workspace?: Workspace
  ): Promise<{ url: string }>;
}
const forbidden = [".git", ".env", ".aws", ".ssh", ".npmrc", ".netrc"];
function pathParts(path: string): string[] {
  if (
    typeof path !== "string" ||
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\x00-\x1f]/.test(path)
  )
    throw new Error("Invalid relative path");
  const parts = path.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        forbidden.some((item) => part === item || (item === ".env" && part.startsWith(".env.")))
    )
  )
    throw new Error("Path is protected");
  return parts;
}
const within = (path: string, prefix: string) =>
  prefix === "." || path === prefix || path.startsWith(prefix + "/");
function allowed(path: string, prefixes: readonly string[]) {
  pathParts(path);
  return prefixes.some((prefix) => within(path, prefix));
}
export function validatePolicy(input: DeveloperPolicy): DeveloperPolicy {
  if (
    !input ||
    !Array.isArray(input.repositories) ||
    !input.repositories.length ||
    !input.developerModel ||
    !input.developerModelFamily ||
    !input.reviewModel ||
    !input.ticketDestination ||
    typeof input.requireIndependentReview !== "boolean" ||
    !Number.isInteger(input.maxFileBytes) ||
    input.maxFileBytes < 1 ||
    input.maxFileBytes > 1000000
  )
    throw new TypeError("Invalid developer policy");
  const seen = new Set<string>();
  for (const repo of input.repositories) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo.repository) ||
      seen.has(repo.repository) ||
      !validBranch(repo.baseBranch) ||
      !repo.branchPrefix.endsWith("/") ||
      !validBranch(repo.branchPrefix + "candidate")
    )
      throw new TypeError("Invalid repository policy");
    seen.add(repo.repository);
    for (const paths of [repo.readablePaths, repo.writablePaths, repo.protectedPaths]) {
      if (
        !Array.isArray(paths) ||
        !paths.every((path) => {
          try {
            if (path !== ".") pathParts(path);
            return true;
          } catch {
            return false;
          }
        })
      )
        throw new TypeError("Invalid path policy");
    }
    if (
      !repo.readablePaths.length ||
      !Array.isArray(repo.checks) ||
      !repo.checks.every((id) => /^[A-Za-z0-9_.:-]+$/.test(id)) ||
      new Set(repo.checks).size !== repo.checks.length
    )
      throw new TypeError("Invalid checks");
    if (
      !repo.writablePaths.every((path) => repo.readablePaths.some((prefix) => within(path, prefix)))
    )
      throw new TypeError("Writable paths must be readable");
  }
  return structuredClone(input);
}
function validBranch(branch: string) {
  return (
    typeof branch === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_./-]{0,150}$/.test(branch) &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".") &&
    !branch.endsWith(".lock") &&
    branch.split("/").every((p) => !p.startsWith("."))
  );
}
function checkDiff(diff: DiffSnapshot, policy: RepositoryPolicy) {
  if (!diff || !/^[a-f0-9]{64}$/.test(diff.fingerprint) || !Array.isArray(diff.files))
    throw new Error("Invalid authoritative diff");
  for (const file of diff.files)
    for (const path of [file.path, ...(file.previousPath ? [file.previousPath] : [])]) {
      if (
        file.symlink ||
        !allowed(path, policy.writablePaths) ||
        policy.protectedPaths.some((prefix) => within(path, prefix))
      )
        throw new Error("Outgoing diff exceeds policy");
    }
}
export function createDeveloper(policyInput: DeveloperPolicy, host: DeveloperHost) {
  const policy = validatePolicy(policyInput);
  const getPolicy = (repo: string) => {
    const result = policy.repositories.find((p) => p.repository === repo);
    if (!result) throw new Error("Repository is not allowed");
    return structuredClone(result);
  };
  async function active<T>(
    runId: string,
    write: boolean,
    operation: (
      run: RunRecord,
      repo: RepositoryPolicy,
      workspace: Workspace,
      fence: string
    ) => Promise<T>
  ): Promise<T> {
    const initial = await host.loadRun(runId);
    if (!initial) throw new Error("Initialize the run first");
    const repo = getPolicy(initial.repository);
    return host.withLease(repo.repository, runId, async (fence) => {
      const run = await host.loadRun(runId);
      if (!run || run.repository !== repo.repository) throw new Error("Run changed");
      if (write && (run.mode === "research" || run.publication))
        throw new Error("Run is read-only");
      const workspace = await host.workspace(runId, repo, run.branch, false);
      return operation(run, repo, workspace, fence);
    });
  }
  async function checkedPath(
    workspace: Workspace,
    repo: RepositoryPolicy,
    path: string,
    write: boolean
  ) {
    pathParts(path);
    const canonical = await workspace.canonicalPath(path);
    // No aliases, including in-repository symlinks, can bypass the lexical policy.
    if (
      canonical !== path ||
      !allowed(canonical, write ? repo.writablePaths : repo.readablePaths) ||
      repo.protectedPaths.some((prefix) => within(canonical, prefix))
    )
      throw new Error("Path exceeds policy");
    return canonical;
  }
  return {
    async initialize(
      runId: string,
      input: { repository: string; branch: string; mode: "research" | "develop" }
    ) {
      if (!runId || runId.length > 200) throw new Error("Invalid run identity");
      const repo = getPolicy(input.repository);
      if (
        !validBranch(input.branch) ||
        !input.branch.startsWith(repo.branchPrefix) ||
        !["research", "develop"].includes(input.mode)
      )
        throw new Error("Branch or mode exceeds policy");
      return host.withLease(repo.repository, runId, async () => {
        const existing = await host.loadRun(runId);
        if (
          existing &&
          (existing.repository !== input.repository ||
            existing.branch !== input.branch ||
            existing.mode !== input.mode)
        )
          throw new Error("Run identity already bound");
        const workspace = await host.workspace(runId, repo, input.branch, !existing);
        if (!existing) await host.saveRun(runId, { ...input });
        return workspace.context();
      });
    },
    read: (runId: string, path: string) =>
      active(runId, false, async (_, repo, ws) => {
        const content = await ws.read(await checkedPath(ws, repo, path, false));
        if (content !== null && Buffer.byteLength(content) > policy.maxFileBytes)
          throw new Error("File exceeds configured limit");
        return content;
      }),
    edit: (
      runId: string,
      input: { path: string; oldText: string; newText: string; replaceAll?: boolean }
    ) =>
      active(runId, true, async (run, repo, ws) => {
        const path = await checkedPath(ws, repo, input.path, true);
        const content = await ws.read(path);
        if (content === null || !input.oldText)
          throw new Error("Existing content and nonempty oldText are required");
        const matches = content.split(input.oldText).length - 1;
        if (matches === 0 || (!input.replaceAll && matches !== 1))
          throw new Error("Replacement is missing or ambiguous");
        const updated = content.split(input.oldText).join(input.newText);
        if (Buffer.byteLength(updated) > policy.maxFileBytes)
          throw new Error("File exceeds configured limit");
        await ws.write(path, updated);
        delete run.checks;
        delete run.review;
        await host.saveRun(runId, run);
        return { replacements: matches };
      }),
    write: (runId: string, path: string, content: string) =>
      active(runId, true, async (run, repo, ws) => {
        if (Buffer.byteLength(content) > policy.maxFileBytes)
          throw new Error("File exceeds configured limit");
        await ws.write(await checkedPath(ws, repo, path, true), content);
        delete run.checks;
        delete run.review;
        await host.saveRun(runId, run);
        return { written: true };
      }),
    list: (runId: string) =>
      active(runId, false, async (_, repo, ws) => {
        const files = [];
        for (const path of await ws.list()) {
          try {
            files.push(await checkedPath(ws, repo, path, false));
          } catch {
            /* Hide paths outside readable policy. */
          }
        }
        return files.sort();
      }),
    ticket: (runId: string, input: { title: string; description: string }) =>
      active(runId, true, async (run) => {
        if (run.ticket) return { reference: run.ticket };
        const ticket = await host.createTicket({
          ...input,
          runId,
          destination: policy.ticketDestination,
        });
        if (!ticket.reference) throw new Error("Tracker did not return a reference");
        run.ticket = ticket.reference;
        await host.saveRun(runId, run);
        return ticket;
      }),
    checks: (runId: string) =>
      active(runId, true, async (run, repo, ws) => {
        const before = await ws.diff();
        checkDiff(before, repo);
        if (!repo.checks.length) throw new Error("No check workflow configured");
        const results: Record<string, CheckResult> = {};
        for (const id of repo.checks) {
          const result = await ws.runCheck(id);
          if (
            !Number.isInteger(result.exitCode) ||
            !Number.isInteger(result.assertionsPassed) ||
            !Number.isInteger(result.assertionsFailed) ||
            result.assertionsPassed < 0 ||
            result.assertionsFailed < 0 ||
            typeof result.setupFailed !== "boolean" ||
            typeof result.artifact !== "string" ||
            !result.artifact
          )
            throw new Error("Invalid check evidence");
          results[id] = result;
        }
        const after = await ws.diff();
        checkDiff(after, repo);
        if (after.fingerprint !== before.fingerprint)
          throw new Error("Checks changed the working tree");
        run.checks = { fingerprint: after.fingerprint, results };
        delete run.review;
        await host.saveRun(runId, run);
        return results;
      }),
    review: (runId: string) =>
      active(runId, true, async (run, repo, ws) => {
        const diff = await ws.diff();
        checkDiff(diff, repo);
        if (
          !run.checks ||
          run.checks.fingerprint !== diff.fingerprint ||
          Object.keys(run.checks.results).length !== repo.checks.length ||
          Object.values(run.checks.results).some(
            (r) => r.exitCode !== 0 || r.setupFailed || r.assertionsFailed !== 0
          )
        )
          throw new Error("Current diff needs passing configured checks");
        const result = await host.review({
          model: policy.reviewModel,
          diff,
          checks: run.checks.results,
        });
        if (!result.model || !result.modelFamily || !result.provider || !result.artifact)
          throw new Error("Review provenance required");
        if (policy.requireIndependentReview && result.modelFamily === policy.developerModelFamily)
          throw new Error("Review model family is not independent");
        const after = await ws.diff();
        if (after.fingerprint !== diff.fingerprint) throw new Error("Diff changed during review");
        run.review = { fingerprint: diff.fingerprint, result };
        await host.saveRun(runId, run);
        return result;
      }),
    publish: (runId: string) =>
      active(runId, false, async (run, repo, ws, fence) => {
        if (run.publication) return run.publication;
        if (run.mode !== "develop" || !run.ticket)
          throw new Error("Development run and ticket required");
        const diff = await ws.diff();
        checkDiff(diff, repo);
        if (
          !diff.files.length ||
          !run.review ||
          run.review.fingerprint !== diff.fingerprint ||
          run.review.result.verdict !== "approve"
        )
          throw new Error("Current diff needs approval");
        const publication = await host.publishDraft(
          {
            runId,
            fence,
            repository: repo.repository,
            baseBranch: repo.baseBranch,
            branch: run.branch,
            ticket: run.ticket,
            fingerprint: diff.fingerprint,
          },
          ws
        );
        let url: URL;
        try {
          url = new URL(publication.url);
        } catch {
          throw new Error("Invalid draft publication result");
        }
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
          throw new Error("Invalid draft publication result");
        run.publication = publication;
        await host.saveRun(runId, run);
        return publication;
      }),
  };
}
