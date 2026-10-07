import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description: "Create or reuse the audit ticket in the configured destination.",
  inputSchema: z.object({ title: z.string().min(1).max(200), description: z.string().max(20000) }),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.ticket(ctx.session.id, input);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
