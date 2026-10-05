import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description: "Read a file within the configured canonical path boundary.",
  inputSchema: z.object({ path: z.string() }),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.read(ctx.session.id, input.path);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
