import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description: "Initialize a configured repository and discover its instructions and skills.",
  inputSchema: z.object({
    repository: z.string(),
    branch: z.string(),
    mode: z.enum(["research", "develop"]),
  }),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.initialize(ctx.session.id, input);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
