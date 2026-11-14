import type { Model } from "./modelStore";
import type { ChatMessage } from "./nodeFile";

export class LlmError extends Error {}

/** OpenAI-compatible chat completions call. Runs server-side so keys never reach the browser. */
export async function chatCompletion(model: Model, messages: ChatMessage[]): Promise<{ text: string; usage?: unknown }> {
  const url = model.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(model.apiKey ? { authorization: `Bearer ${model.apiKey}` } : {}) },
      body: JSON.stringify({ model: model.modelName, messages }),
    });
  } catch (e: any) {
    throw new LlmError(`Cannot reach the model endpoint (${model.baseUrl}): ${e?.cause?.message ?? e?.message ?? e}`);
  }
  const raw = await res.text();
  let json: any;
  try {
    json = raw ? JSON.parse(raw) : undefined;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const detail = json?.error?.message ?? (raw.slice(0, 200) || res.statusText);
    throw new LlmError(`Model returned an error (HTTP ${res.status}): ${detail}`);
  }
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new LlmError("Model returned an unexpected response (no answer text)");
  return { text, usage: json.usage };
}

/** Streaming variant (OpenAI SSE). Calls onDelta per chunk; resolves with the full text only after `[DONE]`. */
export async function chatCompletionStream(
  model: Model,
  messages: ChatMessage[],
  onDelta: (d: string) => void,
): Promise<{ text: string; usage?: unknown }> {
  const url = model.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(model.apiKey ? { authorization: `Bearer ${model.apiKey}` } : {}) },
      body: JSON.stringify({ model: model.modelName, messages, stream: true, stream_options: { include_usage: true } }),
    });
  } catch (e: any) {
    throw new LlmError(`Cannot reach the model endpoint (${model.baseUrl}): ${e?.cause?.message ?? e?.message ?? e}`);
  }
  if (!res.ok || !res.body) {
    const raw = await res.text().catch(() => "");
    let detail = raw.slice(0, 200) || res.statusText;
    try {
      detail = JSON.parse(raw)?.error?.message ?? detail;
    } catch {
      /* not JSON */
    }
    throw new LlmError(`Model returned an error (HTTP ${res.status}): ${detail}`);
  }
  let text = "";
  let usage: unknown;
  let done = false;
  let buf = "";
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      done = true;
      return;
    }
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (json?.error) throw new LlmError(`Model stream failed: ${json.error.message ?? "unknown error"}`);
    if (json?.usage) usage = json.usage;
    const d = json?.choices?.[0]?.delta?.content;
    if (typeof d === "string" && d) {
      text += d;
      onDelta(d);
    }
  };
  try {
    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        handle(buf.slice(0, i).trim());
        buf = buf.slice(i + 1);
      }
    }
    handle(buf.trim());
  } catch (e: any) {
    if (e instanceof LlmError) throw e;
    throw new LlmError(`The model stream was interrupted: ${e?.cause?.message ?? e?.message ?? e}`);
  }
  if (!done) throw new LlmError("The model stream ended unexpectedly (no completion marker)");
  return { text, usage };
}
