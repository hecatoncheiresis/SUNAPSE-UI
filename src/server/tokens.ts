import type { ChatMessage } from "./nodeFile";

/** Approximate token count of a text. Always an estimate: callers must mark it as such. */
export const CHARS_PER_TOKEN = 3.5;
export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

export const estimateMessages = (messages: ChatMessage[]): number =>
  messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

/** Total tokens (prompt + completion) from an OpenAI-style usage object, if it has usable numbers. */
export function reportedTotal(usage: any): number | undefined {
  if (typeof usage?.total_tokens === "number") return usage.total_tokens;
  if (typeof usage?.prompt_tokens === "number" && typeof usage?.completion_tokens === "number") return usage.prompt_tokens + usage.completion_tokens;
  return undefined;
}

export interface Meter {
  used: number;
  limit: number | null;
  estimated: boolean;
}
