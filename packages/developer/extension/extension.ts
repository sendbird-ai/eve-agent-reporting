import { defineExtension } from "eve/extension";
import { z } from "zod";
import { validatePolicy, type DeveloperPolicy, type DeveloperHost } from "./lib/core.js";
export interface DeveloperBindings {
  host: DeveloperHost;
}
const policy = z
  .custom<DeveloperPolicy>((value) => {
    try {
      validatePolicy(value as DeveloperPolicy);
      return true;
    } catch {
      return false;
    }
  }, "Invalid developer policy")
  .transform(validatePolicy);
const bindings = z.custom<DeveloperBindings>((value) => {
  const b = value as DeveloperBindings;
  return (
    b &&
    [
      "withLease",
      "loadRun",
      "saveRun",
      "workspace",
      "createTicket",
      "review",
      "publishDraft",
    ].every((key) => typeof (b.host as unknown as Record<string, unknown>)?.[key] === "function")
  );
}, "Trusted host bindings required");
export default defineExtension({ config: z.object({ policy, bindings }) });
