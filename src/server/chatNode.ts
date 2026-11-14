import fs from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./errors";
import { exclusive } from "./fileLock";
import { chatCompletion, chatCompletionStream, LlmError } from "./llmClient";
import type { Model, ModelStore } from "./modelStore";
import { newHeader, replaceHeader, dialogueAsText, parseLensFile, parseNodeFile, serializeDigests, serializeExchange, serializeHeader, type ChatMessage, type Exchange, type Header, type ParsedNodeFile, type RecordedDigest } from "./nodeFile";
import type { ProjectStore } from "./projectStore";
import { estimateMessages, estimateTokens, reportedTotal, type Meter } from "./tokens";


/** The System Prompt goes before the question in the request; it is not part of the question itself. */
const withPrompt = (systemPrompt: string | undefined, question: string) => (systemPrompt ? `${systemPrompt}\n\n${question}` : question);

export interface ChatState {
  model: string;
  /** The System Prompt in force for the next question ("" when none). */
  systemPrompt: string;
  exchanges: Exchange[];
  /** Source Node of a Fork. */
  forkedFrom?: string;
  /** Prefilled input for a Fork with no question sent yet; not stored in the Dialogue File. */
  draft?: string;
  /** Lens Nodes whose Digests open the conversation, in connection order (top to bottom Input Slots); fixed by the first question. */
  digestSources?: string[];
}

/** Dialogue Files of Chat Nodes: header + appended Q&A, one LLM call per question. */
export class ChatService {
  constructor(private project: ProjectStore, private models: ModelStore) {}

  private fileOf(id: string) {
    return path.join(this.project.dir, "chats", `${id}.md`);
  }

  private requireChat(id: string) {
    const node = this.project.state.nodes.find((n) => n.id === id);
    if (!node || node.type !== "chat") throw new HttpError(404, "no such Chat Node");
    return node;
  }

  /** Lens Nodes feeding this Chat Node: recorded in the file once asked, otherwise the current Edges in connection order. */
  private digestSources(id: string, parsed: ParsedNodeFile | undefined): string[] {
    if (parsed && parsed.exchanges.length > 0) return parsed.digests.length ? parsed.digests.map((d) => d.source) : parsed.header.contextFrom ?? [];
    return this.project.inputsOf(id);
  }

  private sourcesField(id: string, parsed: ParsedNodeFile | undefined) {
    const digestSources = this.digestSources(id, parsed);
    return digestSources.length ? { digestSources } : {};
  }

  /** Live Digests of the given Lens Nodes in order; an empty Digest brings nothing and is left out. */
  private async liveDigests(sources: string[]): Promise<RecordedDigest[]> {
    const out: RecordedDigest[] = [];
    for (const source of sources) {
      const lens = parseLensFile(await this.project.readLensFile(source));
      if (lens.digest.trim()) out.push({ source, text: lens.digest });
    }
    return out;
  }

  /**
   * The Digests this chat works with: those recorded in its file once asked (never reloaded), otherwise the live ones.
   * A legacy file that only names its Lens Nodes still reads their live Digests.
   */
  private digestsOf(id: string, parsed: ParsedNodeFile | undefined): Promise<RecordedDigest[]> {
    if (parsed && parsed.exchanges.length > 0 && parsed.digests.length > 0) return Promise.resolve(parsed.digests);
    return this.liveDigests(this.digestSources(id, parsed));
  }

  /** The Digest block: every Digest under a `### nodeN` heading, or "" when there are none. */
  private blockOf(digests: RecordedDigest[]): string {
    return digests.map((d) => `### ${d.source}\n\n${d.text}`).join("\n\n");
  }

  /**
   * Everything that would be sent to the Model: the conversation-only content with the Digest block merged
   * into the first user message (before the first question), then the new question if there is one.
   */
  private async requestMessages(id: string, parsed: ParsedNodeFile | undefined, question?: string, digestList?: RecordedDigest[]): Promise<ChatMessage[]> {
    const digests = this.blockOf(digestList ?? (await this.digestsOf(id, parsed)));
    const messages: ChatMessage[] = (parsed?.exchanges ?? []).flatMap((e): ChatMessage[] => [
      { role: "user", content: withPrompt(e.systemPrompt, e.question) },
      { role: "assistant", content: e.answer },
    ]);
    if (question !== undefined) messages.push({ role: "user", content: withPrompt(parsed?.header.systemPrompt, question) });
    if (digests && messages.length > 0) messages[0] = { role: "user", content: `${digests}\n\n${messages[0].content}` };
    else if (digests) messages.push({ role: "user", content: digests });
    return messages;
  }

  private async read(id: string): Promise<ParsedNodeFile | undefined> {
    try {
      return parseNodeFile(await fs.readFile(this.fileOf(id), "utf8"));
    } catch (e: any) {
      if (e.code === "ENOENT") return undefined;
      throw e;
    }
  }

  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return exclusive(id, fn);
  }

  async state(id: string): Promise<ChatState> {
    this.requireChat(id);
    const parsed = await this.read(id);
    const forkedFrom = parsed?.header.forkedFrom;
    let draft: string | undefined;
    if (forkedFrom && !parsed!.exchanges.length) {
      try {
        draft = dialogueAsText(parseNodeFile(await fs.readFile(path.join(this.project.dir, "chats", `${forkedFrom}.md`), "utf8")));
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    return { model: parsed?.header.model ?? "", systemPrompt: parsed?.header.systemPrompt ?? "", exchanges: parsed?.exchanges ?? [], ...(forkedFrom ? { forkedFrom } : {}), ...(draft !== undefined ? { draft } : {}), ...this.sourcesField(id, parsed) };
  }

  /** Sets the Model in the header, keeping every other byte of an existing file. */
  private async writeModel(id: string, text: string | undefined, model: string) {
    const header = text ? parseNodeFile(text).header : newHeader(id, model);
    header.model = model;
    await fs.writeFile(this.fileOf(id), text ? replaceHeader(text, header) : serializeHeader(header));
  }

  private pickModel(modelId: unknown) {
    if (typeof modelId !== "string" || !this.models.get(modelId)) throw new HttpError(400, "Choose a Model first");
    return this.models.get(modelId)!;
  }

  setModel(id: string, modelId: unknown): Promise<ChatState> {
    this.requireChat(id);
    return this.serial(id, async () => {
      const model = this.pickModel(modelId);
      let text: string | undefined;
      try {
        text = await fs.readFile(this.fileOf(id), "utf8");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      await this.writeModel(id, text, model.id);
      return this.state(id);
    });
  }

  /** Sets the System Prompt in the header (an empty text clears it), keeping every other byte of an existing file. */
  setSystemPrompt(id: string, systemPrompt: unknown): Promise<ChatState> {
    this.requireChat(id);
    if (typeof systemPrompt !== "string") throw new HttpError(400, "systemPrompt must be text");
    return this.serial(id, async () => {
      let text: string | undefined;
      try {
        text = await fs.readFile(this.fileOf(id), "utf8");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      const header = text ? parseNodeFile(text).header : newHeader(id);
      if (systemPrompt.trim()) header.systemPrompt = systemPrompt;
      else delete header.systemPrompt;
      await fs.writeFile(this.fileOf(id), text ? replaceHeader(text, header) : serializeHeader(header));
      return this.state(id);
    });
  }

  ask(id: string, question: unknown, modelId: unknown): Promise<{ answer: string; usage?: unknown }> {
    return this.exchange(id, question, modelId, (model, messages) => chatCompletion(model, messages));
  }

  /** Like ask, but answer deltas are reported as they arrive; the file is written only after a complete stream. */
  askStream(id: string, question: unknown, modelId: unknown, onDelta: (d: string) => void): Promise<{ answer: string; usage?: unknown }> {
    return this.exchange(id, question, modelId, (model, messages) => chatCompletionStream(model, messages, onDelta));
  }

  private exchange(
    id: string,
    question: unknown,
    modelId: unknown,
    call: (model: Model, messages: ChatMessage[]) => Promise<{ text: string; usage?: unknown }>,
  ): Promise<{ answer: string; usage?: unknown }> {
    this.requireChat(id);
    if (typeof question !== "string" || question.trim() === "") throw new HttpError(400, "question is required");
    return this.serial(id, async () => {
      const parsed = await this.read(id);
      const asked = parsed?.exchanges.length ?? 0;
      const model = this.pickModel(modelId ?? parsed?.header.model);
      const digests = await this.digestsOf(id, parsed);
      const messages = await this.requestMessages(id, parsed, question, digests);
      let result;
      try {
        result = await call(model, messages);
      } catch (e) {
        if (e instanceof LlmError) throw new HttpError(502, e.message);
        throw e;
      }
      const sent = parsed?.header.systemPrompt;
      const exchange: Exchange = { question, answer: result.text, model: model.modelName, ...(sent ? { systemPrompt: sent } : {}) };
      if (asked === 0) {
        const header: Header = parsed?.header ?? newHeader(id, model.id);
        header.model = model.id;
        await fs.writeFile(this.fileOf(id), serializeHeader(header) + serializeDigests(digests) + serializeExchange(exchange));
      } else {
        await fs.appendFile(this.fileOf(id), serializeExchange(exchange));
      }
      await this.recordReported(id, asked + 1, reportedTotal(result.usage), model.id);
      return { answer: result.text, usage: result.usage };
    });
  }

  /** Stores the API-reported total in the file header (or clears the stale one), keeping the exchanges byte for byte. */
  private async recordReported(id: string, exchanges: number, total: number | undefined, modelId: string) {
    const text = await fs.readFile(this.fileOf(id), "utf8");
    const header = parseNodeFile(text).header;
    header.model = modelId;
    delete header.reportedTokens;
    delete header.reportedAfter;
    if (total !== undefined) Object.assign(header, { reportedTokens: total, reportedAfter: exchanges });
    await fs.writeFile(this.fileOf(id), replaceHeader(text, header));
  }

  /** Token Meter: API-reported usage after an answer, otherwise an estimate. Never blocks anything. */
  async meter(id: string, pending: unknown): Promise<Meter> {
    this.requireChat(id);
    const text = typeof pending === "string" ? pending : "";
    const parsed = await this.read(id);
    const limit = (parsed?.header.model && this.models.get(parsed.header.model)?.contextLimit) || null;
    const asked = parsed?.exchanges.length ?? 0;
    const reported = parsed?.header.reportedTokens;
    if (reported !== undefined && parsed?.header.reportedAfter === asked) {
      return text ? { used: reported + estimateTokens(withPrompt(parsed?.header.systemPrompt, text)), limit, estimated: true } : { used: reported, limit, estimated: false };
    }
    const messages = await this.requestMessages(id, parsed, text || undefined);
    return { used: estimateMessages(messages), limit, estimated: true };
  }
}
