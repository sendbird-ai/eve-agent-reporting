# Quality utilities

`classifyCheck` distinguishes passing assertions, assertion failure, setup failure and inconclusive evidence. Structured test results must come from a trusted runner adapter, not model-supplied claims or a parsed arbitrary stderr line.

`proveRedGreen` runs the unfixed check, restores fixed code in `finally`, then runs the fixed check. Failed restoration stops further work. It returns proof only for a genuine assertion failure followed by passing assertions. An empty suite, import crash or installation failure is not proof.

`auditText` scans generic credential patterns and optionally caller-supplied private identifiers. Findings contain rule IDs/positions, never matched strings. The repository CLI scans maintained source and unpacked tarballs. Keep private denylists outside public source. Exact reviewed provenance exceptions are restricted to package metadata. Scanning complements manual review and cannot certify the absence of all private content or erase historical artifacts.

Behavior evaluations and coverage instrumentation remain consumer responsibilities. This module supplies evidence contracts, not a universal model evaluator or coverage measurement.
