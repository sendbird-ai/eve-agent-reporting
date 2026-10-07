import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBaseline, validateBaseline, installedFromNpmLock } from "../dist/index.js";
const baseline = {
  schemaVersion: 1,
  nodeMajor: 24,
  sdk: { name: "eve", version: "0.66.2" },
  components: {
    "example-component": {
      version: "0.1.0",
      capabilities: ["developer"],
      requiredConfig: ["repositoryPolicy"],
    },
  },
};
const consumer = {
  state: "active",
  declared: { "example-component": "0.1.0", eve: "0.66.2" },
  installed: { "example-component": "0.1.0", eve: "0.66.2" },
  capabilities: ["developer"],
  configuredKeys: ["repositoryPolicy"],
  nodeMajor: 24,
  deploymentVerified: true,
};
test("rejects floating approved pins", () => {
  assert.throws(() =>
    validateBaseline({
      ...baseline,
      components: { a: { version: "^0.1.0", capabilities: [], requiredConfig: [] } },
    })
  );
  assert.throws(() => validateBaseline({ ...baseline, sdk: { name: "eve", version: "latest" } }));
});
test("source and installed readiness cannot imply deployed verification", () => {
  assert.deepEqual(compareBaseline(baseline, consumer), []);
  assert.deepEqual(compareBaseline(baseline, { ...consumer, deploymentVerified: false }), [
    { kind: "deployment-unverified" },
  ]);
});
test("actionable drift identifies declarations, locks, capabilities and missing config", () => {
  const differences = compareBaseline(baseline, {
    ...consumer,
    declared: { "example-component": "^0.1.0" },
    installed: {},
    capabilities: [],
    configuredKeys: [],
    nodeMajor: 22,
  });
  assert.ok(
    differences.some((d) => d.kind === "declared-version" && d.target === "example-component")
  );
  assert.ok(differences.some((d) => d.kind === "installed-version"));
  assert.ok(differences.some((d) => d.kind === "missing-config"));
  assert.ok(differences.some((d) => d.kind === "missing-capability"));
  assert.ok(differences.some((d) => d.kind === "runtime-version"));
});
test("missing/inaccessible/retired states are explicit, never healthy", () => {
  for (const state of ["missing", "inaccessible", "retired"])
    assert.deepEqual(compareBaseline(baseline, { ...consumer, state }), [{ kind: state }]);
});
test("npm lock extraction reads resolved versions and reports absent packages honestly", () => {
  assert.deepEqual(
    installedFromNpmLock(
      { lockfileVersion: 3, packages: { "node_modules/example-component": { version: "0.1.0" } } },
      ["example-component", "missing"]
    ),
    { "example-component": "0.1.0" }
  );
  assert.throws(() => installedFromNpmLock({ lockfileVersion: 1 }, []));
});
