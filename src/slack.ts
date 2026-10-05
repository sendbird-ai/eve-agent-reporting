/** Extract distinct Slack user mentions (`<@U123ABC>`) from message text. */
export function extractTaggedUserIds(text: string): string[] {
  return [...new Set([...text.matchAll(/<@([A-Z0-9]+)>/g)].map((match) => match[1]))];
}
