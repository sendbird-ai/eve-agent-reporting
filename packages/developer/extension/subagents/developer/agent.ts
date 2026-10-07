import { defineAgent, defineDynamic } from "eve";
import extension from "../../extension.js";
export default defineAgent({
  description:
    "Scoped repository research and development with configured checks, review and draft pull requests. Never merges or deploys.",
  defaultTools: false,
  model: defineDynamic({
    events: { "session.started": () => extension.config.policy.developerModel },
  }),
});
