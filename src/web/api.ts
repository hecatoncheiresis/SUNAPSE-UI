export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(json?.error ?? res.statusText);
  return json as T;
}

/** POST that consumes the SSE answer stream: onDelta per chunk, resolves with the full answer. */
export async function apiStream(url: string, body: unknown, onDelta: (d: string) => void): Promise<string> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error((text && JSON.parse(text)?.error) || res.statusText);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let answer: string | undefined;
  const handle = (block: string) => {
    if (!block.startsWith("data: ")) return;
    const ev = JSON.parse(block.slice(6));
    if (ev.error) throw new Error(ev.error);
    if (typeof ev.delta === "string") onDelta(ev.delta);
    if (ev.done) answer = ev.answer;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      handle(buf.slice(0, i));
      buf = buf.slice(i + 2);
    }
  }
  if (answer === undefined) throw new Error("The answer stream ended unexpectedly");
  return answer;
}
