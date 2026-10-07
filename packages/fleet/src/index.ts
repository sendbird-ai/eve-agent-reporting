export interface CapabilityBaseline {
  schemaVersion: 1;
  components: Record<string, { version: string; capabilities: string[]; requiredConfig: string[] }>;
  sdk?: { name: string; version: string };
  nodeMajor: number;
}
export interface ConsumerSnapshot {
  state: "active" | "missing" | "inaccessible" | "retired";
  declared: Record<string, string>;
  installed: Record<string, string>;
  capabilities: string[];
  configuredKeys: string[];
  nodeMajor?: number;
  deploymentVerified: boolean;
}
export interface AdoptionDifference {
  kind: string;
  target?: string;
  expected?: string;
  actual?: string;
}
const exact = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
export function validateBaseline(input: CapabilityBaseline): CapabilityBaseline {
  if (
    input.schemaVersion !== 1 ||
    !Number.isInteger(input.nodeMajor) ||
    input.nodeMajor < 20 ||
    !input.components ||
    typeof input.components !== "object" ||
    Array.isArray(input.components)
  )
    throw new TypeError("Invalid baseline");
  for (const component of Object.values(input.components)) {
    if (
      !component ||
      !exact.test(component.version) ||
      !Array.isArray(component.capabilities) ||
      !Array.isArray(component.requiredConfig) ||
      ![...component.capabilities, ...component.requiredConfig].every(
        (value) => typeof value === "string" && value.length > 0
      )
    )
      throw new TypeError("Components require exact versions and named capabilities/config keys");
  }
  if (input.sdk && (!input.sdk.name || !exact.test(input.sdk.version)))
    throw new TypeError("SDK requires exact version");
  return structuredClone(input);
}
/** Read-only comparison. Source, installed versions and deployment evidence are separate facts. */
export function compareBaseline(
  baselineInput: CapabilityBaseline,
  snapshot: ConsumerSnapshot
): AdoptionDifference[] {
  const baseline = validateBaseline(baselineInput);
  if (!["active", "missing", "inaccessible", "retired"].includes(snapshot.state))
    throw new TypeError("Invalid consumer state");
  if (snapshot.state !== "active") return [{ kind: snapshot.state }];
  const differences: AdoptionDifference[] = [];
  const components = Object.entries(baseline.components).map(([name, config]) => ({
    name,
    ...config,
  }));
  if (baseline.sdk) components.push({ ...baseline.sdk, capabilities: [], requiredConfig: [] });
  for (const component of components) {
    for (const origin of ["declared", "installed"] as const) {
      if (snapshot[origin][component.name] !== component.version)
        differences.push({
          kind: `${origin}-version`,
          target: component.name,
          expected: component.version,
          actual: snapshot[origin][component.name] ?? "missing",
        });
    }
    for (const capability of component.capabilities)
      if (!snapshot.capabilities.includes(capability))
        differences.push({ kind: "missing-capability", target: capability });
    for (const key of component.requiredConfig)
      if (!snapshot.configuredKeys.includes(key))
        differences.push({ kind: "missing-config", target: key });
  }
  if (snapshot.nodeMajor !== baseline.nodeMajor)
    differences.push({
      kind: "runtime-version",
      expected: String(baseline.nodeMajor),
      actual: String(snapshot.nodeMajor ?? "unknown"),
    });
  if (!snapshot.deploymentVerified) differences.push({ kind: "deployment-unverified" });
  return differences;
}
/** npm lockfile v2/v3. The caller selects the consumer-relative node_modules path. */
export function installedFromNpmLock(
  lock: { lockfileVersion?: number; packages?: Record<string, { version?: string }> },
  packageNames: readonly string[],
  prefix = ""
): Record<string, string> {
  if (![2, 3].includes(lock.lockfileVersion ?? 0) || !lock.packages)
    throw new TypeError("Expected npm lockfile v2 or v3");
  if (prefix && (!prefix.endsWith("/") || prefix.includes("..") || prefix.startsWith("/")))
    throw new TypeError("Invalid lock prefix");
  const versions: Record<string, string> = {};
  for (const name of packageNames) {
    const version = lock.packages[`${prefix}node_modules/${name}`]?.version;
    if (version) versions[name] = version;
  }
  return versions;
}
