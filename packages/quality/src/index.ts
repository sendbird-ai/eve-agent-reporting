/** Evidence supplied by a trusted test adapter, never inferred from an arbitrary nonzero exit. */
export interface CheckEvidence {
  exitCode: number;
  assertions: { passed: number; failed: number };
  setupFailed: boolean;
}
export function classifyCheck(
  result: CheckEvidence
): "pass" | "assertion-failure" | "setup-failure" | "inconclusive" {
  if (result.setupFailed) return "setup-failure";
  if (
    ![result.exitCode, result.assertions.passed, result.assertions.failed].every(
      Number.isInteger
    ) ||
    result.assertions.passed < 0 ||
    result.assertions.failed < 0
  )
    return "inconclusive";
  if (result.exitCode !== 0 && result.assertions.failed > 0) return "assertion-failure";
  if (result.exitCode === 0 && result.assertions.failed === 0 && result.assertions.passed > 0)
    return "pass";
  return "inconclusive";
}
export async function proveRedGreen(adapter: {
  runUnfixed(): Promise<CheckEvidence>;
  restoreFixed(): Promise<void>;
  runFixed(): Promise<CheckEvidence>;
}): Promise<{
  red: ReturnType<typeof classifyCheck>;
  green: ReturnType<typeof classifyCheck>;
  proven: boolean;
}> {
  let red: ReturnType<typeof classifyCheck> = "inconclusive";
  try {
    red = classifyCheck(await adapter.runUnfixed());
  } finally {
    try {
      await adapter.restoreFixed();
    } catch {
      throw new Error("Working tree restoration failed; stop development");
    }
  }
  const green = classifyCheck(await adapter.runFixed());
  return { red, green, proven: red === "assertion-failure" && green === "pass" };
}
export interface AuditFinding {
  rule: string;
  offset: number;
}
/** Findings contain rule IDs and positions only, never matched text or private denylist values. */
export function auditText(text: string, forbiddenTerms: readonly string[] = []): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const term of forbiddenTerms) {
    if (!term.trim()) throw new TypeError("Empty audit terms are invalid");
    const offset = text.toLowerCase().indexOf(term.toLowerCase());
    if (offset !== -1) findings.push({ rule: "private-identifier", offset });
  }
  for (const [rule, regex] of [
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    [
      "credential-token",
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[A-Z0-9]{16})\b/g,
    ],
    ["url-credentials", /https?:\/\/[^\s/]+:[^\s/@]+@/g],
  ] as const) {
    for (const match of text.matchAll(regex)) findings.push({ rule, offset: match.index! });
  }
  return findings;
}
