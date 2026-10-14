/** The host owns credentials, network deadlines and Slack scopes. No write operations. */
export type SlackReadOperation =
  | "conversations.info" | "conversations.members" | "users.info" | "users.lookupByEmail";
export type SlackRead = (operation: SlackReadOperation, body: Record<string, unknown>) => Promise<unknown>;
export interface Person {
  id: string;
  displayName: string;
  /** Presentation preference from trusted host configuration, never Slack profile text. */
  technical: boolean;
}
export type PersonResult = { status: "found"; person: Person } | { status: "unknown" };
export interface Audience {
  kind: "dm" | "group-dm" | "public-channel" | "private-channel" | "unknown";
  external: boolean | "unknown";
  complete: boolean;
  humanCount: number;
  detail: "plain" | "technical";
  reason: "known-private-audience" | "public-or-external" | "mixed-audience" | "incomplete";
}
export interface DirectoryOptions {
  read: SlackRead;
  /** Exact user IDs, configured by the application. Not permissions. */
  technicalUserIds: readonly string[];
  maxMembers?: number;
  maxPages?: number;
}
const ID = /^[UW][A-Z0-9]{2,}$/;
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function bound(value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new TypeError("Invalid lookup limit");
  return value;
}
/** No cross-turn cache: channel membership and role configuration can change. */
export function createSlackDirectory(options: DirectoryOptions) {
  const technicalIds = new Set(options.technicalUserIds);
  if ([...technicalIds].some((id) => !ID.test(id))) throw new TypeError("Invalid configured user ID");
  const maxMembers = bound(options.maxMembers ?? 100, 1000);
  const maxPages = bound(options.maxPages ?? 5, 20);
  async function read(operation: SlackReadOperation, body: Record<string, unknown>) {
    try {
      const result = record(await options.read(operation, body));
      return result.ok === true ? result : {};
    } catch { return {}; } // Never expose raw provider errors or credentials.
  }
  function personFrom(value: unknown, expectedId?: string): PersonResult {
    const user = record(value);
    const profile = record(user.profile);
    if (typeof user.id !== "string" || !ID.test(user.id) || (expectedId && user.id !== expectedId)
      || user.deleted !== false || user.is_bot !== false || user.is_app_user === true) return { status: "unknown" };
    const name = [profile.display_name, profile.real_name, user.name]
      .find((name) => typeof name === "string" && name.trim()) as string | undefined;
    return { status: "found", person: {
      id: user.id, displayName: (name ?? user.id).slice(0, 200), technical: technicalIds.has(user.id),
    } };
  }
  async function lookupPerson(userId: string): Promise<PersonResult> {
    if (!ID.test(userId)) return { status: "unknown" };
    return personFrom((await read("users.info", { user: userId })).user, userId);
  }
  async function lookupEmail(email: string): Promise<PersonResult> {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "unknown" };
    const user = (await read("users.lookupByEmail", { email })).user;
    // Do not trust a provider returning a different identity for this exact lookup.
    const returned = record(record(user).profile).email;
    if (typeof returned !== "string" || returned.toLowerCase() !== email.toLowerCase()) return { status: "unknown" };
    return personFrom(user);
  }
  async function audience(channelId: string): Promise<Audience> {
    const unknown: Audience = { kind: "unknown", external: "unknown", complete: false,
      humanCount: 0, detail: "plain", reason: "incomplete" };
    if (!/^[CDG][A-Z0-9]{2,}$/.test(channelId)) return unknown;
    const channel = record((await read("conversations.info", { channel: channelId })).channel);
    if (channel.id !== channelId) return unknown;
    const kind: Audience["kind"] = channel.is_im === true ? "dm"
      : channel.is_mpim === true ? "group-dm" : channel.is_private === true ? "private-channel"
      : channel.is_private === false ? "public-channel" : "unknown";
    // Missing external-sharing metadata is not proof of an internal audience.
    const external = typeof channel.is_ext_shared === "boolean" ? channel.is_ext_shared : "unknown";
    const base: Audience = { ...unknown, kind, external };
    if (kind === "unknown") return base;
    if (kind === "public-channel" || external === true)
      return { ...base, reason: "public-or-external" };
    if (external === "unknown") return base;
    const ids = new Set<string>();
    let complete = false;
    if (kind === "dm") {
      if (typeof channel.user !== "string" || !ID.test(channel.user)) return base;
      ids.add(channel.user);
      complete = true;
    } else {
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      for (let page = 0; page < maxPages; page++) {
        const response = await read("conversations.members", { channel: channelId, limit: Math.min(200, maxMembers), ...(cursor ? { cursor } : {}) });
        if (!Array.isArray(response.members) || response.members.length > maxMembers) break;
        let invalid = false;
        for (const id of response.members) {
          if (typeof id !== "string" || !ID.test(id)) { invalid = true; break; }
          ids.add(id);
        }
        if (invalid || ids.size > maxMembers) break;
        const next = record(response.response_metadata).next_cursor;
        if (typeof next !== "string") break;
        if (!next) { complete = true; break; }
        if (seenCursors.has(next)) break;
        seenCursors.add(next);
        cursor = next;
      }
    }
    if (!complete) return base;
    let humanCount = 0;
    let allTechnical = true;
    for (const id of ids) {
      const response = await read("users.info", { user: id });
      const user = record(response.user);
      if (user.id !== id) { complete = false; continue; }
      if (user.deleted === true || user.is_bot === true || user.is_app_user === true) continue;
      const result = personFrom(user, id);
      if (result.status !== "found") { complete = false; continue; }
      humanCount++;
      if (!result.person.technical || user.is_stranger === true) allTechnical = false;
    }
    complete = complete && humanCount > 0;
    const technical = complete && allTechnical;
    return { ...base, complete, humanCount, detail: technical ? "technical" : "plain",
      reason: !complete ? "incomplete" : technical ? "known-private-audience" : "mixed-audience" };
  }
  return { lookupPerson, lookupEmail, audience };
}
