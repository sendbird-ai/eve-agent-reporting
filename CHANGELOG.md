# Changelog

## 0.3.0 (unreleased)

- Add `createReportingClient` with explicit collection URL, token provider,
  request timeout, optional transport, and sanitized error callback.
- Add `/client` entry point without the company compatibility adapter.
- Preserve existing top-level report functions, types, and wire behavior;
  deprecate implicit company configuration in favor of an app-local adapter.
- Add receiver contract, local examples, migration instructions, MIT license,
  contribution guide, and compatibility tests.

## 0.2.0

- Add outbound messages, audience observations, and Slack mention extraction.

## 0.1.0

- Initial inbound interaction reporting client.
