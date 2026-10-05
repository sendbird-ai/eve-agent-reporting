import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description: "Review the current authoritative diff with honest reviewer provenance.",
  inputSchema: z.object({}),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.review(ctx.session.id);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
