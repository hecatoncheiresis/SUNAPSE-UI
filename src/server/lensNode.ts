import fs from "node:fs/promises";
import { DEFAULT_EXTRACTION_PROMPT, fillExtractionPrompt, splitExtraction } from "./extraction";
import { HttpError } from "./errors";
import { exclusive } from "./fileLock";
import { chatCompletion, LlmError } from "./llmClient";
import type { ModelStore } from "./modelStore";
import { conversationOnly, emptySections, LENS_SECTIONS, newHeader, parseLensFile, parseNodeFile, serializeLensFile, type LensSections, type ParsedLensFile } from "./nodeFile";
import { isLens, type ProjectStore } from "./projectStore";
import { estimateMessages, estimateTokens, type Meter } from "./tokens";

export type Target = { percent: number } | { tokens: number };
export interface LensState {
  model: string;
  /** The Handoff Questionnaire answers. */
  sections: LensSections;
  /** The Lens Prompt as it is sent: the filled sections put together; empty when none is filled. */
  prompt: string;
  target: Target | null;
  digest: string;
  /** Auto Lens Nodes: the Extraction Prompt in force and the Extraction Model id ("" while none is chosen). */
  extractionPrompt?: string;
  extractionModel?: string;
}

const encodeTarget = (target: Target) => ("percent" in target ? `${target.percent}%` : `${target.tokens} tokens`);
function decodeTarget(text: string | undefined): Target | null {
  const match = /^(\d+(?:\.\d+)?)(%| tokens)$/.exec(text ?? "");
  if (!match) return null;
  return match[2] === "%" ? { percent: Number(match[1]) } : { tokens: Number(match[1]) };
}

/** A Compression Target from a request body, or an HttpError when it is not a positive number (a percent at most 100). */
export function validateTarget(target: any): Target {
  const amount = target?.percent ?? target?.tokens;
  if (typeof amount !== "number" || !(amount > 0) || !Number.isFinite(amount)) throw new HttpError(400, "Compression Target must be a positive number");
  if ("percent" in target && amount > 100) throw new HttpError(400, "A percent Compression Target cannot exceed 100");
  return "percent" in target ? { percent: amount } : { tokens: amount };
}

/** The Lens Prompt: filled Handoff Questionnaire sections under their titles, empty ones left out. */
export function assembleLensPrompt(sections: LensSections): string {
  return LENS_SECTIONS.filter((x) => sections[x.key].trim())
    .map((x) => `## ${x.title}\n\n${sections[x.key]}`)
    .join("\n\n");
}

const BASE_INSTRUCTION = "Compress the dialogues above, keeping what is essential.";
const VERBATIM_INSTRUCTION = 'Copy the content of "Current Artifacts & State" into the result verbatim; it does not count towards the size target.';

/** Lens Nodes: settings, Run (inputs -> one LLM call -> single Digest) and manual Digest edits. */
export class LensService {
  constructor(private project: ProjectStore, private models: ModelStore) {}

  private requireLens(id: string) {
    const node = this.project.state.nodes.find((candidate) => candidate.id === id);
    if (!node || !isLens(node.type)) throw new HttpError(404, "no such Lens Node");
    return node;
  }

  private async read(id: string): Promise<ParsedLensFile> {
    const node = this.requireLens(id);
    try {
      return parseLensFile(await fs.readFile(this.project.fileOf(node), "utf8"));
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      return { header: newHeader(id), sections: emptySections(), digest: "" };
    }
  }

  private view(id: string, lensFile: ParsedLensFile): LensState {
    const auto = this.requireLens(id).type === "auto-lens";
    return {
      ...(auto ? { extractionPrompt: lensFile.extractionPrompt ?? DEFAULT_EXTRACTION_PROMPT, extractionModel: lensFile.header.extractionModel ?? "" } : {}),
      model: lensFile.header.model,
      sections: lensFile.sections,
      prompt: assembleLensPrompt(lensFile.sections),
      target: decodeTarget(lensFile.header.target),
      digest: lensFile.digest,
    };
  }

  private modify(id: string, change: (lensFile: ParsedLensFile) => void): Promise<LensState> {
    this.requireLens(id);
    return exclusive(id, async () => {
      const lensFile = await this.read(id);
      change(lensFile);
      await fs.writeFile(this.project.fileOf(this.requireLens(id)), serializeLensFile(lensFile));
      return this.view(id, lensFile);
    });
  }

  async state(id: string): Promise<LensState> {
    return this.view(id, await this.read(id));
  }

  setSettings(id: string, body: any): Promise<LensState> {
    const { modelId, sections, target, extractionModelId, extractionPrompt } = body ?? {};
    const lens = this.requireLens(id);
    if ((extractionModelId !== undefined || extractionPrompt !== undefined) && lens.type !== "auto-lens") throw new HttpError(400, "Only an Auto Lens Node has an Extraction Prompt and Extraction Model");
    if (extractionModelId !== undefined && (typeof extractionModelId !== "string" || !this.models.get(extractionModelId))) throw new HttpError(400, "Unknown Model");
    if (extractionPrompt !== undefined && extractionPrompt !== null && typeof extractionPrompt !== "string") throw new HttpError(400, "extractionPrompt must be text, or null to restore the default");
    if (modelId !== undefined && (typeof modelId !== "string" || !this.models.get(modelId))) throw new HttpError(400, "Unknown Model");
    const known = LENS_SECTIONS.map((x) => x.key) as string[];
    if (sections !== undefined && (typeof sections !== "object" || sections === null || Object.entries(sections).some(([k, v]) => !known.includes(k) || typeof v !== "string"))) {
      throw new HttpError(400, "sections must map questionnaire sections to text");
    }
    let encodedTarget: string | undefined;
    if (target !== undefined && target !== null) {
      encodedTarget = encodeTarget(validateTarget(target));
    }
    return this.modify(id, (lensFile) => {
      if (modelId !== undefined) lensFile.header.model = modelId;
      if (extractionModelId !== undefined) lensFile.header.extractionModel = extractionModelId;
      if (extractionPrompt === null) {
        // Reset prompt: the Project's Node Defaults text, or the built-in one while none is set.
        const own = this.project.nodeDefaults("auto-lens").extractionPrompt;
        if (own) lensFile.extractionPrompt = own;
        else delete lensFile.extractionPrompt;
      }
      else if (extractionPrompt !== undefined) lensFile.extractionPrompt = extractionPrompt;
      if (sections !== undefined) Object.assign(lensFile.sections, sections);
      if (target === null) delete lensFile.header.target;
      else if (encodedTarget) lensFile.header.target = encodedTarget;
    });
  }

  setDigest(id: string, digest: unknown): Promise<LensState> {
    this.requireLens(id);
    if (typeof digest !== "string") throw new HttpError(400, "digest must be text");
    return this.modify(id, (lensFile) => {
      lensFile.digest = digest;
      delete lensFile.header.answerTokens; // the reported size no longer describes this text
    });
  }

  /**
   * Input Chat Nodes in connection order. Edges on the Canvas plus the Chat Nodes recorded in the file header that left the
   * Canvas (ADR-0001): a removed input Chat Node stays an input because its file is still on disk. A recorded Chat Node
   * is skipped when it has nothing to give, or when it took this Lens Node's Digest in (it is an output, not an input).
   */
  private async inputIds(id: string, file: ParsedLensFile): Promise<string[]> {
    const onCanvas = this.project.state.nodes.map((n) => n.id);
    const extra: string[] = [];
    for (const recorded of file.header.connections) {
      if (onCanvas.includes(recorded)) continue;
      let parsed;
      try {
        parsed = parseNodeFile(await this.project.readNodeFile("chat", recorded));
      } catch {
        extra.push(recorded); // a missing file must fail the Run clearly, not be dropped silently
        continue;
      }
      if (parsed.exchanges.length > 0 && !parsed.digests.some((d) => d.source === id)) extra.push(recorded);
    }
    return [...new Set([...extra, ...this.project.inputsOf(id)])];
  }

  /** Input Dialogues (conversation only) as `### nodeN` blocks, and their combined token estimate. A missing file fails. */
  private async readInputDialogues(inputs: string[]): Promise<{ blocks: string[]; combined: number; counts: Record<string, number> }> {
    const blocks: string[] = [];
    const counts: Record<string, number> = {};
    let combined = 0;
    for (const source of inputs) {
      const parsed = parseNodeFile(await this.project.readNodeFile("chat", source));
      combined += estimateMessages(conversationOnly(parsed));
      counts[source] = parsed.exchanges.length;
      const body = parsed.exchanges.map((exchange) => `Question:\n${exchange.question}\n\nAnswer:\n${exchange.answer}`).join("\n\n");
      blocks.push(`### ${source}\n\n${body}`);
    }
    return { blocks, combined, counts };
  }

  /** Token Meter: input dialogues + Lens Prompt + answer (expected from the Compression Target, real after Run). Never blocks. */
  async meter(id: string): Promise<Meter & { input: number; prompt: number; answer: number }> {
    const lensFile = await this.read(id);
    const { combined } = await this.readInputDialogues(await this.inputIds(id, lensFile)).catch(() => ({ combined: 0 })); // a display estimate never fails
    const compression = decodeTarget(lensFile.header.target);
    let answer: number;
    if (lensFile.header.ran) answer = lensFile.header.answerTokens ?? estimateTokens(lensFile.digest);
    else if (!compression) answer = 0;
    else answer = "percent" in compression ? Math.round((combined * compression.percent) / 100) : compression.tokens;
    const prompt = estimateTokens(assembleLensPrompt(lensFile.sections));
    const limit = (lensFile.header.model && this.models.get(lensFile.header.model)?.contextLimit) || null;
    return { used: combined + prompt + answer, limit, estimated: true, input: combined, prompt, answer };
  }

  /** The single user message: all input Dialogues under `### nodeN`, the Lens Prompt (or the base instruction when it is empty), the soft target. */
  private async buildRequest(id: string, lensFile: ParsedLensFile): Promise<{ content: string; counts: Record<string, number> }> {
    const inputs = await this.inputIds(id, lensFile);
    if (inputs.length === 0) throw new HttpError(400, "Add an Edge from at least one Chat Node to this Lens Node first");
    if (!lensFile.header.model) throw new HttpError(400, "Choose a Model for this Lens Node first");
    const { blocks, combined, counts } = await this.readInputDialogues(inputs);
    const compression = decodeTarget(lensFile.header.target);
    let targetText = "";
    if (compression && "percent" in compression) {
      const approx = Math.max(1, Math.round((combined * compression.percent) / 100));
      targetText = `\n\nCompression target: make the result about ${compression.percent}% of the size of the dialogues above (roughly ${approx} tokens). This is a soft target, not a hard limit.`;
    } else if (compression) {
      targetText = `\n\nCompression target: make the result about ${compression.tokens} tokens long. This is a soft target, not a hard limit.`;
    }
    const prompt = assembleLensPrompt(lensFile.sections);
    const instruction = prompt ? `${prompt}${lensFile.sections.artifacts.trim() ? `\n\n${VERBATIM_INSTRUCTION}` : ""}` : BASE_INSTRUCTION;
    return { content: `${blocks.join("\n\n")}\n\n${instruction}${targetText}`, counts };
  }

  run(id: string): Promise<LensState> {
    this.requireLens(id);
    return exclusive(id, async () => {
      const lensFile = await this.read(id);
      const { content, counts } = await this.buildRequest(id, lensFile);
      const model = this.models.get(lensFile.header.model);
      if (!model) throw new HttpError(400, `Model ${lensFile.header.model} no longer exists`);
      let text: string;
      let usage: any;
      try {
        ({ text, usage } = await chatCompletion(model, [{ role: "user", content }]));
      } catch (e) {
        if (e instanceof LlmError) throw new HttpError(502, e.message);
        throw e;
      }
      lensFile.digest = text;
      lensFile.header.ran = true;
      lensFile.header.runInputs = counts;
      if (typeof usage?.completion_tokens === "number") lensFile.header.answerTokens = usage.completion_tokens;
      else delete lensFile.header.answerTokens;
      await fs.writeFile(this.project.fileOf(this.requireLens(id)), serializeLensFile(lensFile));
      return this.view(id, lensFile);
    });
  }

  private requireAuto(id: string) {
    const node = this.requireLens(id);
    if (node.type !== "auto-lens") throw new HttpError(400, "Only an Auto Lens Node can Extract");
  }

  /** Extraction Token Meter: the Dialogues and the Extraction Prompt, against the Extraction Model's Context Limit. Never blocks. */
  async extractionMeter(id: string): Promise<Meter> {
    this.requireAuto(id);
    const lensFile = await this.read(id);
    const { combined } = await this.readInputDialogues(await this.inputIds(id, lensFile)).catch(() => ({ combined: 0 }));
    const prompt = estimateTokens(fillExtractionPrompt(lensFile.extractionPrompt ?? DEFAULT_EXTRACTION_PROMPT, ""));
    const limit = (lensFile.header.extractionModel && this.models.get(lensFile.header.extractionModel)?.contextLimit) || null;
    return { used: combined + prompt, limit, estimated: true };
  }

  /** Extraction: the Dialogues and the Extraction Prompt go to the Extraction Model; its reply overwrites the four sections. */
  extract(id: string): Promise<LensState> {
    this.requireAuto(id);
    return exclusive(id, async () => {
      const lensFile = await this.read(id);
      const inputs = await this.inputIds(id, lensFile);
      if (inputs.length === 0) throw new HttpError(400, "Add an Edge from at least one Chat Node to this Auto Lens Node first");
      if (!lensFile.header.extractionModel) throw new HttpError(400, "Choose an Extraction Model for this Auto Lens Node first");
      const model = this.models.get(lensFile.header.extractionModel);
      if (!model) throw new HttpError(400, `Model ${lensFile.header.extractionModel} no longer exists`);
      const { blocks } = await this.readInputDialogues(inputs);
      const content = fillExtractionPrompt(lensFile.extractionPrompt ?? DEFAULT_EXTRACTION_PROMPT, blocks.join("\n\n"));
      let text: string;
      try {
        ({ text } = await chatCompletion(model, [{ role: "user", content }]));
      } catch (e) {
        if (e instanceof LlmError) throw new HttpError(502, e.message);
        throw e;
      }
      const sections = splitExtraction(text);
      if (!sections) throw new HttpError(502, "The Extraction Model's reply could not be split into the four Handoff Questionnaire sections; nothing was changed");
      lensFile.sections = sections;
      await fs.writeFile(this.project.fileOf(this.requireLens(id)), serializeLensFile(lensFile));
      return this.view(id, lensFile);
    });
  }
}
