import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";
// Eve compiles environments before runtime mount configuration is bound.
export const environment = VercelSandbox.environment({ resources: { vcpus: 2 } });
export default defineSandbox(() => environment.open({ networkPolicy: "deny-all" }));
