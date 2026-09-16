# Contributing

Open an issue describing a reproducible bug or a proposed API change. For code
changes, fork the repository, create a branch, and open a pull request.

Run `npm ci`, `npm run typecheck`, `npm test`, and `npm pack --dry-run` before
submitting. Include regression coverage for transport or compatibility changes.

Keep the configurable client independent of company services and environment
variable names. Preserve existing payloads and legacy behavior during the 0.3
transition; document breaking changes before a future major release. Keep
examples self-contained and use placeholder identities and credentials.
