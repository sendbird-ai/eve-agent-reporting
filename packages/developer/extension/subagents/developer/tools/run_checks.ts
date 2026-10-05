import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description: "Run only configured checks and bind evidence to the authoritative diff.",
  inputSchema: z.object({}),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.checks(ctx.session.id);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
