import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCheck, proveRedGreen, auditText } from "../dist/index.js";
const pass = { exitCode: 0, assertions: { passed: 4, failed: 0 }, setupFailed: false };
test("setup crashes and empty suites cannot masquerade as assertion proof", () => {
  assert.equal(classifyCheck({ ...pass, exitCode: 1, setupFailed: true }), "setup-failure");
  assert.equal(classifyCheck({ ...pass, exitCode: 1 }), "inconclusive");
  assert.equal(classifyCheck({ ...pass, assertions: { passed: 0, failed: 0 } }), "inconclusive");
  assert.equal(
    classifyCheck({ ...pass, exitCode: 1, assertions: { passed: 0, failed: 1 } }),
    "assertion-failure"
  );
});
test("restore always runs; setup failure is not red/green proof", async () => {
  let restored = false;
  const result = await proveRedGreen({
    runUnfixed: async () => ({ ...pass, exitCode: 1, setupFailed: true }),
    restoreFixed: async () => {
      restored = true;
    },
    runFixed: async () => pass,
  });
  assert.equal(result.proven, false);
  assert.ok(restored);
  await assert.rejects(
    proveRedGreen({
      runUnfixed: async () => {
        throw Error("runner crashed");
      },
      restoreFixed: async () => {
        restored = true;
      },
      runFixed: async () => pass,
    }),
    /runner crashed/
  );
  assert.ok(restored);
});
test("failed restore prevents fixed-code execution and redacts provider error", async () => {
  let ran = false;
  await assert.rejects(
    proveRedGreen({
      runUnfixed: async () => pass,
      restoreFixed: async () => {
        throw Error("private details");
      },
      runFixed: async () => {
        ran = true;
        return pass;
      },
    }),
    (error) => error.message === "Working tree restoration failed; stop development"
  );
  assert.equal(ran, false);
});
test("real assertion failure then passing suite provides proof", async () =>
  assert.equal(
    (
      await proveRedGreen({
        runUnfixed: async () => ({ ...pass, exitCode: 1, assertions: { passed: 0, failed: 2 } }),
        restoreFixed: async () => {},
        runFixed: async () => pass,
      })
    ).proven,
    true
  ));
test("private identifiers and secret patterns return no matched content", () => {
  const synthetic = ["synthetic", "private", "tenant"].join("-");
  const token = ["ghp", "_", "A".repeat(36)].join("");
  const findings = auditText(`hello ${synthetic} ${token}`, [synthetic]);
  assert.equal(findings.length, 2);
  assert.ok(!JSON.stringify(findings).includes(synthetic));
  assert.ok(!JSON.stringify(findings).includes(token));
  assert.throws(() => auditText("", [""]));
  assert.deepEqual(auditText("https://example.com/api"), []);
});
