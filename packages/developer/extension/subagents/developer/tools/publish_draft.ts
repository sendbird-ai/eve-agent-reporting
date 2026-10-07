import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description:
    "Validate the whole outgoing diff and publish an idempotent fenced draft PR. Never merges.",
  inputSchema: z.object({}),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.publish(ctx.session.id);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
