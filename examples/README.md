# Try reporting locally

From a repository checkout, run `npm ci` and `npm run build`.

In one terminal:

```sh
export REPORTING_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))')"
npm run example:receiver
```

Set the same `REPORTING_TOKEN` value in a second terminal, then run:

```sh
npm run example:send
```

The receiver listens only on `127.0.0.1:8787`. It accepts the
`support-assistant` agent with the configured token and responds with JSON counts.
The sender awaits all three requests. Repeated example events are deduplicated;
restarting the receiver resets its in-memory state.

Use your own service to implement persistent storage and a dashboard. This
example deliberately keeps only counters and deduplication keys. It is a local
demonstration and is not intended to be deployed as a production service.
