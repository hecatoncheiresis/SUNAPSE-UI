/** Node file format: a technical header, then alternating `## Question` / `## Answer` sections. */

export interface Header {
  name: string;
  /** Model id, or "" while no Model is chosen yet. */
  model: string;
  created: string;
  connections: string[];
  /** Auto Lens Nodes only: Model id of the Extraction. */
  extractionModel?: string;
  /** Lens Nodes only: Compression Target as "30%" or "500 tokens". */
  target?: string;
  /** Chat Nodes: the current System Prompt (written on one JSON-quoted header line). */
  systemPrompt?: string;
  /** Id of the Node this one was Forked from (set once at creation). */
  forkedFrom?: string;
  /** Legacy Chat Nodes only: Lens Nodes whose Digests opened the conversation before Digest text was recorded in the file. */
  contextFrom?: string[];
  /** Lens Nodes only: the Lens Node has been Run at least once. */
  ran?: boolean;
  /** Lens Nodes only: for each input Chat Node, how many exchanges it had when the last Run read it. */
  runInputs?: Record<string, number>;
  /** Lens Nodes only: completion tokens the API reported for the last Run's Digest. */
  answerTokens?: number;
  /** Chat Nodes: total tokens the API reported for the latest answer (header data only, never sent to an LLM). */
  reportedTokens?: number;
  /** Chat Nodes: number of exchanges when `reportedTokens` was reported; stale if the file has more or fewer. */
  reportedAfter?: number;
}
export interface Exchange {
  question: string;
  answer: string;
  /** Model that gave the answer (service information, never sent to an LLM); absent in older files. */
  model?: string;
  /** System Prompt that went with the question (service information, never part of the question); absent when there was none. */
  systemPrompt?: string;
}
/** A Digest as it was when the chat's first question took it in. */
export interface RecordedDigest {
  source: string;
  text: string;
}
export interface ParsedNodeFile {
  header: Header;
  /** Digests recorded at the first question, in connection order. */
  digests: RecordedDigest[];
  exchanges: Exchange[];
  /** A trailing question without an answer (never produced by this server, tolerated on read). */
  pendingQuestion?: string;
}
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const Q = "## Question";
const A = "## Answer";
/** The Handoff Questionnaire: section key and title, in questionnaire order. Each title is a `## ` marker in a Lens file. */
export const LENS_SECTIONS = [
  { key: "scope", title: "Project Scope & Objective" },
  { key: "rules", title: "Established Rules & Constraints" },
  { key: "discarded", title: "Discarded Ideas & Solved Blockers" },
  { key: "artifacts", title: "Current Artifacts & State" },
] as const;
export type LensSectionKey = (typeof LENS_SECTIONS)[number]["key"];
export type LensSections = Record<LensSectionKey, string>;
export const emptySections = (): LensSections => ({ scope: "", rules: "", discarded: "", artifacts: "" });
/** Lens files written before the Handoff Questionnaire hold one `## Lens Prompt`, read as the first section. */
const LP = "## Lens Prompt";
/** Lens files written while the questionnaire had a fifth section: its text moves to the end of Current Artifacts & State. */
const NEXT = "## Immediate Next Step";
const DG = "## Digest";
const EP = "## Extraction Prompt";
const SECTION_MARKERS = [EP, ...LENS_SECTIONS.map((x) => `## ${x.title}`)];
const MD = "## Model";
const SP = "## System Prompt";
const CTX = /^## Context: (node\d+)$/;
const ctxMarker = (source: string) => `## Context: ${source}`;
const CONTEXT_PREFIX = "> Context from:";

/** Files written before the interface was English use Russian markers; they are read as the English ones. Appending keeps the old bytes, so such a file may hold both kinds. */
const LEGACY_MARKERS: Record<string, string> = { "## Вопрос": Q, "## Ответ": A, "## Модель": MD };
const LEGACY_CONTEXT = /^## Контекст: (node\d+)$/;
const LEGACY_CONTEXT_PREFIX = "> Контекст из:";
const migrateLine = (l: string) => {
  const ctx = LEGACY_CONTEXT.exec(l);
  if (ctx) return ctxMarker(ctx[1]);
  if (l.startsWith(LEGACY_CONTEXT_PREFIX)) return CONTEXT_PREFIX + l.slice(LEGACY_CONTEXT_PREFIX.length);
  return LEGACY_MARKERS[l] ?? l;
};

/** The default header of a Node file that has no content yet. */
export const newHeader = (id: string, model = ""): Header => ({ name: id, model, created: new Date().toISOString(), connections: [] });

/** Records an Edge to `otherId` in the header (once, in connection order). */
export function addConnection(header: Header, otherId: string) {
  if (!header.connections.includes(otherId)) header.connections.push(otherId);
}
export function removeConnection(header: Header, otherId: string) {
  header.connections = header.connections.filter((c) => c !== otherId);
}

/**
 * Content may contain lines that look like section markers. On write, such a line gets one more leading backslash
 * (`## Answer` -> `\## Answer`, `\## Answer` -> `\\## Answer`); on read, one backslash is removed again.
 */
const MARKER_LINE = `## (?:Question|Answer|Model|Вопрос|Ответ|Модель|System Prompt|Lens Prompt|Immediate Next Step|Extraction Prompt|Digest|Context: node\\d+|Контекст: node\\d+|${LENS_SECTIONS.map((x) => x.title).join("|")})`;
const escapeMarkers = (text: string) => text.replace(new RegExp(`^(\\\\*${MARKER_LINE})$`, "gm"), "\\$1");
const unescapeMarkers = (text: string) => text.replace(new RegExp(`^\\\\(\\\\*${MARKER_LINE})$`, "gm"), "$1");

export function serializeHeader(h: Header): string {
  return `# ${h.name}\n\n- Model: ${h.model}\n- Created: ${h.created}\n- Connections: ${h.connections.join(", ")}\n${h.extractionModel ? `- Extraction model: ${h.extractionModel}\n` : ""}${h.target ? `- Target: ${h.target}\n` : ""}${h.forkedFrom ? `- Forked from: ${h.forkedFrom}\n` : ""}${h.systemPrompt ? `- System prompt: ${JSON.stringify(h.systemPrompt)}\n` : ""}${h.ran ? "- Ran: yes\n" : ""}${h.runInputs && Object.keys(h.runInputs).length ? `- Run inputs: ${Object.entries(h.runInputs).map(([k, v]) => `${k}:${v}`).join(", ")}\n` : ""}${h.answerTokens !== undefined ? `- Answer tokens: ${h.answerTokens}\n` : ""}${h.reportedTokens !== undefined && h.reportedAfter !== undefined ? `- Reported tokens: ${h.reportedTokens}\n- Reported after exchanges: ${h.reportedAfter}\n` : ""}${h.contextFrom?.length ? `\n${CONTEXT_PREFIX} ${h.contextFrom.join(", ")}\n` : ""}\n`;
}

function runInputs(text: string): { runInputs?: Record<string, number> } {
  const entries = text.split(",").map((p) => /^\s*(node\d+):(\d+)\s*$/.exec(p)).filter((m): m is RegExpExecArray => !!m).map((m) => [m[1], Number(m[2])] as const);
  return entries.length ? { runInputs: Object.fromEntries(entries) } : {};
}

function systemPromptField(text: string): { systemPrompt?: string } {
  try {
    const v = JSON.parse(text);
    return typeof v === "string" && v ? { systemPrompt: v } : {};
  } catch {
    return {};
  }
}

function contextFrom(headLines: string[]): { contextFrom?: string[] } {
  const l = headLines.find((x) => x.startsWith(CONTEXT_PREFIX));
  const names = l ? l.slice(CONTEXT_PREFIX.length).split(",").map((n) => n.trim()).filter(Boolean) : [];
  return names.length ? { contextFrom: names } : {};
}

export function serializeExchange(e: Exchange): string {
  const sp = e.systemPrompt ? `${SP}\n\n${escapeMarkers(e.systemPrompt)}\n\n` : "";
  const model = e.model ? `${MD}\n\n${escapeMarkers(e.model)}\n\n` : "";
  return `${sp}${Q}\n\n${escapeMarkers(e.question)}\n\n${model}${A}\n\n${escapeMarkers(e.answer)}\n\n`;
}

/** The Digests recorded at the first question, one `## Context: nodeN` section each. */
export function serializeDigests(digests: RecordedDigest[]): string {
  return digests.map((d) => `${ctxMarker(d.source)}\n\n${escapeMarkers(d.text)}\n\n`).join("");
}

export function parseNodeFile(raw: string): ParsedNodeFile {
  const text = raw.split("\n").map(migrateLine).join("\n");
  const lines = text.split("\n");
  const firstSection = lines.findIndex((l) => l === Q || l === A || l === MD || l === SP || l === LP || l === DG || SECTION_MARKERS.includes(l) || CTX.test(l));
  const headLines = firstSection < 0 ? lines : lines.slice(0, firstSection);
  const field = (key: string) => {
    const l = headLines.find((x) => x.startsWith(`- ${key}:`));
    return l ? l.slice(key.length + 3).trim() : "";
  };
  const header: Header = {
    name: (headLines.find((l) => l.startsWith("# ")) ?? "").slice(2).trim(),
    model: field("Model"),
    created: field("Created"),
    connections: field("Connections").split(",").map((s) => s.trim()).filter(Boolean),
    ...(field("Extraction model") ? { extractionModel: field("Extraction model") } : {}),
    ...(field("Target") ? { target: field("Target") } : {}),
    ...(field("Forked from") ? { forkedFrom: field("Forked from") } : {}),
    ...systemPromptField(field("System prompt")),
    ...contextFrom(headLines),
    ...(field("Ran") === "yes" ? { ran: true } : {}),
    ...runInputs(field("Run inputs")),
    ...(/^\d+$/.test(field("Answer tokens")) ? { answerTokens: Number(field("Answer tokens")) } : {}),
    ...(/^\d+$/.test(field("Reported tokens")) && /^\d+$/.test(field("Reported after exchanges"))
      ? { reportedTokens: Number(field("Reported tokens")), reportedAfter: Number(field("Reported after exchanges")) }
      : {}),
  };
  const exchanges: Exchange[] = [];
  const digests: RecordedDigest[] = [];
  let pendingQuestion: string | undefined;
  if (firstSection >= 0) {
    let kind: "q" | "a" | "m" | "c" | "s" | undefined;
    let source = "";
    let buf: string[] = [];
    let q = "";
    let model: string | undefined;
    let sent: string | undefined;
    const flush = () => {
      const body = unescapeMarkers(buf.join("\n").replace(/^\n+|\n+$/g, ""));
      if (kind === "s") {
        sent = body;
      } else if (kind === "q") {
        q = body;
        model = undefined;
        pendingQuestion = body;
      } else if (kind === "m") {
        model = body;
      } else if (kind === "c") {
        digests.push({ source, text: body });
      } else if (kind === "a") {
        exchanges.push({ question: q, answer: body, ...(model ? { model } : {}), ...(sent ? { systemPrompt: sent } : {}) });
        sent = undefined;
        pendingQuestion = undefined;
      }
      buf = [];
    };
    for (const l of lines.slice(firstSection)) {
      const ctx = CTX.exec(l);
      if (l === Q || l === A || l === MD || l === SP || ctx) {
        flush();
        kind = ctx ? "c" : l === Q ? "q" : l === A ? "a" : l === SP ? "s" : "m";
        if (ctx) source = ctx[1];
      } else buf.push(l);
    }
    flush();
  }
  return { header, digests, exchanges, ...(pendingQuestion !== undefined ? { pendingQuestion } : {}) };
}

/** Replaces only the header of a node file text, keeping every Question/Answer section byte for byte. */
export function replaceHeader(text: string, header: Header): string {
  const m = new RegExp(`^${MARKER_LINE}$`, "m").exec(text);
  return serializeHeader(header) + (m ? text.slice(m.index) : "");
}

/** Conversation only: questions and answers as chat messages; the header never appears. */
export function conversationOnly(parsed: ParsedNodeFile): ChatMessage[] {
  return parsed.exchanges.flatMap((e): ChatMessage[] => [
    { role: "user", content: e.question },
    { role: "assistant", content: e.answer },
  ]);
}

/** Lens Node file: technical header, the five Handoff Questionnaire sections and the single Digest. The header is never sent to an LLM. */
export interface ParsedLensFile {
  header: Header;
  sections: LensSections;
  digest: string;
  /** Auto Lens Nodes: the Extraction Prompt when it differs from the default. */
  extractionPrompt?: string;
}

export function serializeLensFile(l: ParsedLensFile): string {
  const sections = LENS_SECTIONS.map((x) => `## ${x.title}\n\n${escapeMarkers(l.sections[x.key])}\n\n`).join("");
  const prompt = l.extractionPrompt === undefined ? "" : `${EP}\n\n${escapeMarkers(l.extractionPrompt)}\n\n`;
  return `${serializeHeader(l.header)}${prompt}${sections}${DG}\n\n${escapeMarkers(l.digest)}\n`;
}

const trimNl = (s: string) => unescapeMarkers(s.replace(/^\n+|\n+$/g, ""));

export function parseLensFile(text: string): ParsedLensFile {
  const header = parseNodeFile(text).header;
  const names = new Map<string, LensSectionKey | "digest" | "legacyNext" | "extractionPrompt">([[LP, "scope"], [NEXT, "legacyNext"], [DG, "digest"], [EP, "extractionPrompt"], ...LENS_SECTIONS.map((x) => [`## ${x.title}`, x.key] as const)]);
  const sections = emptySections();
  let digest = "";
  let current: LensSectionKey | "digest" | "legacyNext" | "extractionPrompt" | undefined;
  let extractionPrompt: string | undefined;
  let legacyNext = "";
  let body: string[] = [];
  const flush = () => {
    if (!current) return;
    const value = trimNl(body.join("\n"));
    if (current === "digest") digest = value;
    else if (current === "legacyNext") legacyNext = value;
    else if (current === "extractionPrompt") extractionPrompt = value;
    else sections[current] = value;
  };
  for (const line of text.split("\n")) {
    const next = names.get(line);
    if (next) {
      flush();
      current = next;
      body = [];
    } else body.push(line);
  }
  flush();
  if (legacyNext) sections.artifacts = [sections.artifacts, `Immediate Next Step:\n${legacyNext}`].filter(Boolean).join("\n\n");
  return { header, sections, digest, ...(extractionPrompt !== undefined ? { extractionPrompt } : {}) };
}

/** Plain editable text of a dialogue for a Fork's input field: questions and answers only, no header. */
export function dialogueAsText(parsed: ParsedNodeFile): string {
  return parsed.exchanges.map((e) => `Question: ${e.question}\n\nAnswer: ${e.answer}`).join("\n\n");
}
