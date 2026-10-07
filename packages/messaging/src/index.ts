export type ProgressState = "started" | "progress" | "completed" | "failed" | "cancelled";
export interface ProgressEvent {
  taskId: string;
  sequence: number;
  state: ProgressState;
  text: string;
  thread?: string;
}
/** In-process ordering and duplicate suppression. Use a durable host store for cross-instance delivery. */
export function createProgressRelay(options: {
  publish(event: Readonly<ProgressEvent>): Promise<void>;
  maxTasks?: number;
}) {
  const limit = options.maxTasks ?? 1000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000)
    throw new TypeError("maxTasks must be 1..100000");
  const records = new Map<string, { sequence: number; terminal: boolean }>();
  const pending = new Map<string, Promise<unknown>>();
  async function apply(event: ProgressEvent): Promise<"published" | "ignored"> {
    const previous = records.get(event.taskId);
    if (previous && (previous.terminal || event.sequence <= previous.sequence)) return "ignored";
    if (!previous && event.state !== "started") throw new Error("Task must start before progress");
    if (previous && event.state === "started") throw new Error("Task already started");
    if (!previous && records.size >= limit) {
      const completed = [...records].find(([id, record]) => record.terminal && !pending.has(id));
      if (!completed) throw new Error("Progress capacity reached");
      records.delete(completed[0]);
    }
    await options.publish(Object.freeze({ ...event }));
    records.set(event.taskId, {
      sequence: event.sequence,
      terminal: !["started", "progress"].includes(event.state),
    });
    return "published";
  }
  return {
    emit(input: ProgressEvent): Promise<"published" | "ignored"> {
      const event = { ...input };
      if (
        !event.taskId ||
        !Number.isSafeInteger(event.sequence) ||
        event.sequence < 0 ||
        !["started", "progress", "completed", "failed", "cancelled"].includes(event.state) ||
        typeof event.text !== "string" ||
        event.text.length > 4000
      )
        return Promise.reject(new TypeError("Invalid progress event"));
      const current = (pending.get(event.taskId) ?? Promise.resolve())
        .catch(() => {})
        .then(() => apply(event));
      pending.set(event.taskId, current);
      void current
        .finally(() => {
          if (pending.get(event.taskId) === current) pending.delete(event.taskId);
        })
        .catch(() => {});
      return current;
    },
  };
}
/** Escape untrusted text so it cannot inject mentions or links into Slack markup. */
export function renderSlackProgress(event: ProgressEvent): { text: string; thread_ts?: string } {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    text: `${event.state}: ${escape(event.text)}`,
    ...(event.thread ? { thread_ts: event.thread } : {}),
  };
}
export interface ObservedSend {
  eventId: string;
  source: "reactive" | "tool" | "scheduled";
  channel: string;
  messageId: string;
  thread?: string;
}
/** Observe after the host successfully sends. This helper does not send primary messages. */
export function createSendObserver(
  report: (send: Readonly<ObservedSend>) => Promise<void>,
  maxEntries = 10000
) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1)
    throw new TypeError("maxEntries must be positive");
  const completed = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  return async (input: ObservedSend): Promise<void> => {
    if (!input.eventId || !input.messageId || !input.channel)
      throw new TypeError("Observed send requires real transport identifiers");
    if (completed.has(input.eventId)) return;
    if (pending.has(input.eventId)) return pending.get(input.eventId);
    const operation = Promise.resolve()
      .then(() => report(Object.freeze({ ...input })))
      .then(() => {
        completed.add(input.eventId);
        if (completed.size > maxEntries) completed.delete(completed.values().next().value!);
      });
    pending.set(input.eventId, operation);
    try {
      await operation;
    } finally {
      pending.delete(input.eventId);
    }
  };
}
