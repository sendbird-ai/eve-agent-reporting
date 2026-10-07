import { defineTool } from "eve/tools";
import { z } from "zod";
import { engineFor } from "../../../lib/runtime.js";
export default defineTool({
  description: "Replace exact text in a configured file; ambiguous matches are refused.",
  inputSchema: z.object({
    path: z.string(),
    oldText: z.string().min(1),
    newText: z.string(),
    replaceAll: z.boolean().optional(),
  }),
  async execute(input, ctx) {
    const engine = engineFor(ctx);
    try {
      return await engine.edit(ctx.session.id, input);
    } catch {
      return {
        blocked: true,
        reason: "Developer operation failed; check trusted host diagnostics and policy",
      };
    }
  },
});
