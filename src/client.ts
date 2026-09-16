import type {
  ReportAudienceEvidenceParams,
  ReportInboundEventParams,
  ReportOutboundEventParams,
} from "./types.js";

export type * from "./types.js";
export { extractTaggedUserIds } from "./slack.js";

export interface ReportingFailure {
  event: "inbound" | "outbound" | "audience";
  kind: "http" | "request" | "timeout" | "token" | "invalid-slug";
  status?: number;
}

export interface ReportingClientOptions {
  /** Collection URL, e.g. https://reports.example.com/api/agents. Required. */
  baseUrl: string;
  /** Read at each call when a provider is supplied. An empty value skips sending. */
  token: string | (() => string | null | undefined);
  /** Request deadline in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
  /** Optional fetch implementation, useful for testing or custom transport. */
  fetch?: typeof globalThis.fetch;
  /** Receives metadata only, never credentials, payloads, or response bodies. */
  onError?: (failure: ReportingFailure) => void | Promise<void>;
}

export interface ReportingClient {
  reportInboundEvent(params: ReportInboundEventParams): Promise<void>;
  reportOutboundEvent(params: ReportOutboundEventParams): Promise<void>;
  reportAudienceEvidence(params: ReportAudienceEvidenceParams): Promise<void>;
}

/** Create an independent client. No default destination or implicit environment reads. */
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
    throw new TypeError("baseUrl must use HTTP(S), without credentials, query, or fragment");
  }
  const baseUrl = url.href.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new TypeError("timeoutMs must be a positive integer <= 2147483647");
  }
  if (typeof options.token !== "string" && typeof options.token !== "function") {
    throw new TypeError("token must be a string or a token provider");
  }
  const { token: tokenSource, onError, fetch: fetchImpl } = options;

  async function reportFailure(failure: ReportingFailure): Promise<void> {
    try {
      await onError?.(failure);
    } catch {
      // Observability must not fail an agent's turn.
    }
  }

  async function post(
    event: ReportingFailure["event"],
    slug: string,
    path: string,
    body: unknown
  ): Promise<void> {
    let token: string | null | undefined;
    try {
      token = typeof tokenSource === "function" ? tokenSource() : tokenSource;
    } catch {
      await reportFailure({ event, kind: "token" });
      return;
    }
    if (!token) return;
    if (!slug || slug === "." || slug === "..") {
      await reportFailure({ event, kind: "invalid-slug" });
      return;
    }
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await (fetchImpl ?? globalThis.fetch)(
        `${baseUrl}/${encodeURIComponent(slug)}/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          redirect: "error",
          signal,
        }
      );
      if (!response.ok) await reportFailure({ event, kind: "http", status: response.status });
    } catch {
      await reportFailure({ event, kind: signal.aborted ? "timeout" : "request" });
    }
  }

  return {
    reportInboundEvent({ slug, ...body }) {
      return post("inbound", slug, "events", body);
    },
    reportOutboundEvent({ slug, ...body }) {
      return post("outbound", slug, "outbound-events", body);
    },
    reportAudienceEvidence({ slug, entries }) {
      if (entries.length === 0) return Promise.resolve();
      return post("audience", slug, "audience-evidence", { entries });
    },
  };
}
