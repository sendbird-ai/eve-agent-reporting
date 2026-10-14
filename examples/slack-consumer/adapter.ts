import { defaultSlackAuth, type SlackContext, type SlackMessage } from "eve/channels/slack";
import { buildThreadContext, createSlackDirectory, formatSlackBrief } from "@bshaan77/eve-agent-slack";

/** Call from both mention and DM hooks; preserve the host's existing dispatch policy. */
export async function prepareSlackTurn(
  ctx: SlackContext,
  message: SlackMessage,
  technicalUserIds: readonly string[],
) {
  if (!message.author) return null;
  const directory = createSlackDirectory({
    // A production host must enforce request deadlines and its configured read scopes.
    read: (operation, body) => ctx.slack.request(operation, body),
    technicalUserIds,
    maxMembers: 100,
    maxPages: 5,
  });
  const [audience, requester] = await Promise.all([
    directory.audience(message.channelId),
    directory.lookupPerson(message.author.userId),
  ]);
  let messages: typeof ctx.thread.recentMessages = [];
  if (message.threadTs !== message.ts) {
    try {
      await ctx.thread.refresh();
      messages = ctx.thread.recentMessages;
    } catch { /* Missing history stays explicit; no provider errors enter the prompt. */ }
  }
  return {
    auth: defaultSlackAuth(message, ctx),
    context: [formatSlackBrief({
      request: message.text,
      audience,
      requester,
      thread: buildThreadContext({
        messages,
        triggerTs: message.ts,
        // Eve's refresh surface does not attest to complete paginated history.
        historyComplete: message.threadTs === message.ts,
      }),
    })],
  };
}
