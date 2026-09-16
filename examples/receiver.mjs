import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const kinds = new Set(["TRIGGERED", "GROUP_DM_MEMBER", "THREAD_REPLY", "TAGGED_BY_AGENT"]);
const nonempty = (value) => typeof value === "string" && value.length > 0;
const optionalString = (value) => value == null || typeof value === "string";

function validBody(type, body) {
  if (!body || typeof body !== "object") return false;
  if (type === "events") {
    return (
      [body.slackUserId, body.channelId, body.sessionTurnKey].every(nonempty) &&
      (body.messageCount === undefined ||
        (Number.isInteger(body.messageCount) &&
          body.messageCount > 0 &&
          body.messageCount <= 10000))
    );
  }
  if (type === "outbound-events") {
    return (
      [body.slackMessageTs, body.channelId].every(nonempty) &&
      optionalString(body.teamId) &&
      optionalString(body.sourceTool) &&
      (body.isThreadReply === undefined || typeof body.isThreadReply === "boolean")
    );
  }
  return (
    Array.isArray(body.entries) &&
    body.entries.length > 0 &&
    body.entries.length <= 200 &&
    body.entries.every(
      (entry) =>
        entry &&
        [entry.slackUserId, entry.channelId, entry.sourceEventId].every(nonempty) &&
        kinds.has(entry.evidenceKind) &&
        optionalString(entry.teamId)
    )
  );
}

/** Local demonstration only: one authorized agent, no persistence. */
export function createReceiver({ token, agentSlug = "support-assistant" }) {
  if (!nonempty(token)) throw new Error("REPORTING_TOKEN is required");
  const seen = { events: new Set(), "outbound-events": new Set(), "audience-evidence": new Set() };
  const counts = { inbound: 0, outbound: 0, audience: 0 };

  async function handle(req, res) {
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const match = /^\/api\/agents\/([^/]+)\/(events|outbound-events|audience-evidence)$/.exec(
      req.url ?? ""
    );
    if (req.method !== "POST" || !match) return reply(404, { error: "Not found" });
    if (req.headers.authorization !== `Bearer ${token}`)
      return reply(401, { error: "Unauthorized" });
    let slug;
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      return reply(400, { error: "Invalid slug" });
    }
    if (slug !== agentSlug) return reply(403, { error: "Forbidden" });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 256 * 1024) return reply(413, { error: "Body too large" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, { error: "Invalid JSON" });
    }
    const type = match[2];
    if (!validBody(type, body)) return reply(400, { error: "Invalid event" });
    const add = (key) => {
      if (seen[type].has(key)) return false;
      seen[type].add(key);
      return true;
    };
    if (type === "events" && add(body.sessionTurnKey)) counts.inbound += body.messageCount ?? 1;
    if (type === "outbound-events" && add(JSON.stringify([body.channelId, body.slackMessageTs])))
      counts.outbound++;
    if (type === "audience-evidence") {
      for (const entry of body.entries) {
        if (add(JSON.stringify([entry.slackUserId, entry.evidenceKind, entry.sourceEventId])))
          counts.audience++;
      }
    }
    reply(200, { ok: true, counts });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  return { server, counts, handle };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = createReceiver({ token: process.env.REPORTING_TOKEN });
  server.listen(8787, "127.0.0.1", () =>
    console.log("Receiver listening at http://127.0.0.1:8787/api/agents")
  );
}
