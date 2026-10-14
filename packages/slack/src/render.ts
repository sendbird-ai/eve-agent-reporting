/** Escape source strings before putting them into Slack text. Does not invent mentions. */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Normalize prose only; preserve code byte-for-byte and leave ambiguous input unchanged. */
export function normalizeSlackText(input: string): { text: string; warnings: string[] } {
  if (input.length > 100000) return { text: input, warnings: ["input-too-large"] };
  const warnings = new Set<string>();
  const parts: { code: boolean; value: string }[] = [];
  let start = 0;
  let i = 0;
  while (i < input.length) {
    if (input[i] !== "`") { i++; continue; }
    let end = i;
    while (input[end] === "`") end++;
    const delimiter = input.slice(i, end);
    let close = input.indexOf(delimiter, end);
    while (close >= 0 && (input[close - 1] === "`" || input[close + delimiter.length] === "`"))
      close = input.indexOf(delimiter, close + delimiter.length);
    if (close < 0) {
      if (delimiter.length >= 3) return { text: input, warnings: ["unclosed-code-fence"] };
      i = end; continue;
    }
    parts.push({ code: false, value: input.slice(start, i) }, { code: true, value: input.slice(i, close + delimiter.length) });
    i = start = close + delimiter.length;
  }
  parts.push({ code: false, value: input.slice(start) });
  const text = parts.map((part) => {
    if (part.code) return part.value;
    if (/\*{3,}/.test(part.value)) warnings.add("ambiguous-emphasis");
    if (/^\s*\|.*\|\s*$/m.test(part.value)) warnings.add("unsupported-markdown-table");
    // Slack links, mentions and bare URLs are syntax, not prose to rewrite.
    return part.value.split(/(<[^>\n]*>|https?:\/\/[^\s<>]+)/g).map((segment, index) =>
      index % 2 ? segment : segment.replace(/(?<!\*)\*\*(?!\*)([^*\n]+?)\*\*(?!\*)/g, "*$1*")
    ).join("");
  }).join("");
  return { text, warnings: [...warnings] };
}
export interface CitedFinding {
  /** Plain text. Summarize at the specialist, not by deleting evidence at delivery. */
  text: string;
  sources: { label: string; url: string }[];
}
export interface SlackAnswer {
  lead: string;
  findings: CitedFinding[];
  caveats: string[];
  /** A host-verified, reader-accessible artifact. The renderer does not establish access. */
  details?: { label: string; url: string };
}
function link(label: string, raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new TypeError("Invalid source URL"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password
    || /[<>|\s]/.test(raw)) throw new TypeError("Invalid source URL");
  return `<${escapeSlackText(raw)}|${escapeSlackText(label).replace(/\|/g, "&#124;")}>`;
}
export type RenderedAnswer =
  | { status: "ready"; payload: { text: string } }
  | { status: "overflow"; text: string; limit: number };
/** No LLM summarization and no silent deletion of citations/caveats. No network writes. */
export function renderSlackAnswer(answer: SlackAnswer, maxChars = 3500): RenderedAnswer {
  if (!Number.isSafeInteger(maxChars) || maxChars < 100 || maxChars > 40000) throw new TypeError("Invalid reply limit");
  if (!answer.lead.trim()) throw new TypeError("Answer requires a lead");
  const lines = [escapeSlackText(answer.lead)];
  for (const finding of answer.findings) {
    if (!finding.text.trim() || !finding.sources.length) throw new TypeError("Findings require text and sources");
    lines.push(`• ${escapeSlackText(finding.text)} ${finding.sources.map((s) => link(s.label, s.url)).join(" ")}`);
  }
  if (answer.caveats.length) lines.push(`Coverage: ${answer.caveats.map(escapeSlackText).join("; ")}`);
  if (answer.details) lines.push(link(answer.details.label, answer.details.url));
  const text = lines.join("\n\n");
  return text.length > maxChars ? { status: "overflow", text, limit: maxChars } : { status: "ready", payload: { text } };
}
