import type { ToolContext } from "eve/tools";
import extension from "../extension.js";
import { environment } from "../subagents/developer/sandbox.js";
import { createDeveloper, type DeveloperHost } from "./core.js";
export function engineFor(ctx: ToolContext) {
  const configured = extension.config.bindings.host;
  const host: DeveloperHost = {
    withLease: (...args) => configured.withLease(...args),
    loadRun: (...args) => configured.loadRun(...args),
    saveRun: (...args) => configured.saveRun(...args),
    workspace: async (runId, policy, branch, initialize) =>
      configured.workspace(runId, policy, branch, initialize, await ctx.getSandbox(environment)),
    createTicket: (...args) => configured.createTicket(...args),
    review: (...args) => configured.review(...args),
    publishDraft: (...args) => configured.publishDraft(...args),
  };
  return createDeveloper(extension.config.policy, host);
}
