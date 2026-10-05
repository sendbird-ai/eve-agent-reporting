import type { DeveloperHost } from "@bshaan77/eve-agent-developer/core";
const unavailable = async (): Promise<never> => {
  throw new Error("Supply reviewed production host bindings");
};
const host: DeveloperHost = {
  withLease: unavailable,
  loadRun: unavailable,
  saveRun: unavailable,
  workspace: unavailable,
  createTicket: unavailable,
  review: unavailable,
  publishDraft: unavailable,
};
export const bindings = { host };
