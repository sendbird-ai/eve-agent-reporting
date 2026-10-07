import type {
  ReportInboundEventParams,
  ReportOutboundEventParams,
  ReportAudienceEvidenceParams,
  ReportTelemetryEventParams,
} from "./types.js";

export interface ReportingFailure {
  event: "inbound" | "outbound" | "audience" | "telemetry";
  kind: "http" | "request" | "timeout" | "token" | "missing-token" | "invalid-payload";
  status?: number;
  attempts: number;
}
export interface ReportingClientOptions {
  /** Absolute collection URL. No implicit destination or environment reads. */
  baseUrl: string;
  token: string | (() => string | null | undefined | Promise<string | null | undefined>);
  /** Total deadline including credentials, retries and transport. Default 5000; maximum 60000. */
  timeoutMs?: number;
  /** Default 0. Opt in only with verified receiver idempotency. Maximum 3. */
  maxRetries?: number;
  receiverIdempotent?: boolean;
  fetch?: typeof globalThis.fetch;
  /** Metadata only. Callback failures are isolated and asynchronous completion is not awaited. */
  onError?: (failure: ReportingFailure) => void | Promise<void>;
}
export interface ReportingClient {
  reportInboundEvent(params: ReportInboundEventParams): Promise<void>;
  reportOutboundEvent(params: ReportOutboundEventParams): Promise<void>;
  reportAudienceEvidence(params: ReportAudienceEvidenceParams): Promise<void>;
  reportTelemetryEvent(params: ReportTelemetryEventParams): Promise<void>;
}
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);
const transient = (status: number) =>
  status === 429 || status === 502 || status === 503 || status === 504;

export function createReportingClient(options: ReportingClientOptions): ReportingClient {
  let url: URL;
  try {
    url = new URL(options.baseUrl);
  } catch {
    throw new TypeError("baseUrl must be an absolute HTTP(S) collection URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("baseUrl must use HTTP(S) without credentials, query or fragment");
  }
  if (typeof options.token !== "string" && typeof options.token !== "function")
    throw new TypeError("token must be a string or provider");
  const timeoutMs = options.timeoutMs ?? 5000;
  const retries = options.maxRetries ?? 0;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw new TypeError("timeoutMs must be an integer from 1 to 60000");
  if (
    !Number.isInteger(retries) ||
    retries < 0 ||
    retries > 3 ||
    (retries > 0 && options.receiverIdempotent !== true)
  ) {
    throw new TypeError("maxRetries must be 0..3; retries require verified receiverIdempotent");
  }
  const baseUrl = url.href.replace(/\/+$/, "");
  // Copy the trusted configuration; mutating the caller's object cannot change routing.
  const { token: tokenSource, onError, fetch: suppliedFetch } = options;
  const fetchImpl = suppliedFetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetch transport is required");
  function diagnose(failure: ReportingFailure) {
    try {
      Promise.resolve(onError?.(failure)).catch(() => {});
    } catch {
      /* Diagnostics never fail delivery. */
    }
  }
  async function post(
    event: ReportingFailure["event"],
    params: unknown,
    path: string,
    validate: (body: Record<string, unknown>) => boolean
  ) {
    let attempts = 0;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = Symbol("deadline");
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(expired);
      }, timeoutMs);
    });
    const bounded = <T>(operation: Promise<T>) => Promise.race([operation, deadline]);
    let phase: ReportingFailure["kind"] = "invalid-payload";
    try {
      if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error();
      const { slug, ...body } = params as Record<string, unknown>;
      if (!identifier(slug) || !validate(body)) throw new Error();
      if (event === "audience" && Array.isArray(body.entries) && body.entries.length === 0) return;
      const serialized = JSON.stringify(body);
      if (new TextEncoder().encode(serialized).byteLength > 65536) throw new Error();
      phase = "token";
      const token = await bounded(
        Promise.resolve().then(() =>
          typeof tokenSource === "function" ? tokenSource() : tokenSource
        )
      );
      if (token === null || token === undefined || token === "") {
        diagnose({ event, kind: "missing-token", attempts });
        return;
      }
      if (typeof token !== "string" || /[\r\n]/.test(token)) throw new Error();
      phase = "request";
      for (;;) {
        attempts++;
        let retry = false;
        try {
          const response = await bounded(
            Promise.resolve().then(() =>
              fetchImpl(`${baseUrl}/${encodeURIComponent(slug)}/${path}`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                body: serialized,
                redirect: "error",
                signal: controller.signal,
              })
            )
          );
          // Never read or log response bodies. Release the connection if the transport permits it.
          try {
            void response.body?.cancel().catch(() => {});
          } catch {
            /* Custom transports may omit streams. */
          }
          if (response.ok) return;
          retry = transient(response.status) && attempts <= retries;
          if (!retry) {
            diagnose({ event, kind: "http", status: response.status, attempts });
            return;
          }
        } catch (error) {
          if (error === expired || controller.signal.aborted) throw expired;
          retry = attempts <= retries;
          if (!retry) throw error;
        }
        await bounded(new Promise<void>((resolve) => setTimeout(resolve, 25 * attempts)));
      }
    } catch (error) {
      diagnose({
        event,
        kind: error === expired || controller.signal.aborted ? "timeout" : phase,
        attempts,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return {
    reportInboundEvent: (params) =>
      post(
        "inbound",
        params,
        "events",
        (body) =>
          identifier(body.slackUserId) &&
          identifier(body.channelId) &&
          typeof body.sessionTurnKey === "string" &&
          body.sessionTurnKey.length > 0 &&
          body.sessionTurnKey.length <= 2048 &&
          (body.messageCount === undefined ||
            (Number.isInteger(body.messageCount) && Number(body.messageCount) >= 1))
      ),
    reportOutboundEvent: (params) =>
      post(
        "outbound",
        params,
        "outbound-events",
        (body) =>
          identifier(body.slackMessageTs) &&
          identifier(body.channelId) &&
          (body.isThreadReply === undefined || typeof body.isThreadReply === "boolean")
      ),
    reportAudienceEvidence: (params) =>
      post(
        "audience",
        params,
        "audience-evidence",
        (body) =>
          Array.isArray(body.entries) &&
          body.entries.length <= 500 &&
          body.entries.every(
            (entry) =>
              entry &&
              identifier(entry.slackUserId) &&
              identifier(entry.channelId) &&
              identifier(entry.sourceEventId) &&
              ["TRIGGERED", "GROUP_DM_MEMBER", "THREAD_REPLY", "TAGGED_BY_AGENT"].includes(
                entry.evidenceKind
              )
          )
      ),
    reportTelemetryEvent: (params) =>
      post(
        "telemetry",
        params,
        "telemetry-events",
        (body) =>
          body.schemaVersion === 1 &&
          identifier(body.eventId) &&
          identifier(body.kind) &&
          identifier(body.source) &&
          typeof body.occurredAt === "string" &&
          Number.isFinite(Date.parse(body.occurredAt)) &&
          (body.attributes === undefined ||
            (body.attributes !== null &&
              typeof body.attributes === "object" &&
              !Array.isArray(body.attributes) &&
              Object.values(body.attributes).every(
                (value) =>
                  value === null ||
                  typeof value === "string" ||
                  typeof value === "boolean" ||
                  (typeof value === "number" && Number.isFinite(value))
              )))
      ),
  };
}
