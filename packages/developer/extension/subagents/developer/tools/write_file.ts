import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description: "Write a file within trusted policy; invalidate earlier evidence.",
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.write(ctx.session.id, input.path, input.content);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
