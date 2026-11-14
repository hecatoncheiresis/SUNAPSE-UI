import { LENS_SECTIONS, emptySections, type LensSections } from "./nodeFile";

/** Where the Dialogues go in an Extraction Prompt. */
export const EXTRACTION_PLACEHOLDER = "[Paste your chat log, notes, or conversation text here]";
const NOT_SPECIFIED = "Not specified in the provided text.";

export const DEFAULT_EXTRACTION_PROMPT = `You are an expert context-extraction assistant. Your task is to analyze the provided raw text or chat log and extract the core state of the project by answering the Context Handoff Questionnaire below.

### EXTRACTION GUIDELINES:
- Extract facts, decisions, and constraints strictly from the text. Do not invent details.
- Completely filter out conversational filler, intermediate drafts, outdated code, and temporary bugs that were already resolved.
- Maintain 100% precision for technical identifiers (file names, variables, API routes, library versions, metrics).
- If any section is not mentioned or cannot be inferred from the text, explicitly write: "${NOT_SPECIFIED}"

---

### CONTEXT HANDOFF QUESTIONNAIRE

Please format your response strictly using these 4 numbered sections:

1. Project Scope & Objective
- What is the core goal of this project, and what tangible result are we trying to achieve?
(Provide a concise 2–4 sentence summary of the project purpose and intended end deliverable).

2. Established Rules & Constraints
- What mandatory technical stacks, architectural decisions, formatting standards, or style guidelines must be followed?
(List all agreed constraints, tech stack requirements, design patterns, coding conventions, or business logic rules).

3. Discarded Ideas & Solved Blockers
- What approaches, libraries, or ideas did you already test and reject? Why didn't they work?
(List failed attempts, rejected alternatives, or anti-patterns with the exact reason they were abandoned, so future models do not suggest them again).

4. Current Artifacts & State
- What are the latest, finalized versions of your code, outline, data schema, or drafts that the model needs to build upon?
(Extract and provide the exact, uncompressed, latest versions of working code blocks, schemas, file structures, or key text outlines. Do not summarize or truncate critical code).

---

### INPUT TEXT TO ANALYZE:
${EXTRACTION_PLACEHOLDER}`;

/** The Extraction Prompt with the Dialogues in place of the placeholder, or after it when there is none. */
export function fillExtractionPrompt(prompt: string, dialogues: string): string {
  return prompt.includes(EXTRACTION_PLACEHOLDER) ? prompt.replace(EXTRACTION_PLACEHOLDER, () => dialogues) : `${prompt}\n\n${dialogues}`;
}

/** The four sections of an Extraction reply, found by their numbered titles; undefined when one is missing or out of order. */
export function splitExtraction(reply: string): LensSections | undefined {
  const lines = reply.split("\n");
  const starts: number[] = [];
  let from = 0;
  for (const [i, section] of LENS_SECTIONS.entries()) {
    const title = new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*${i + 1}\\s*[.)]\\s*(?:\\*\\*)?\\s*${section.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\*\\*)?\\s*:?\\s*(?:\\*\\*)?\\s*$`, "i");
    const at = lines.findIndex((l, n) => n >= from && title.test(l));
    if (at < 0) return undefined;
    starts.push(at);
    from = at + 1;
  }
  const out = emptySections();
  LENS_SECTIONS.forEach((section, i) => {
    const text = lines.slice(starts[i] + 1, starts[i + 1] ?? lines.length).join("\n").trim();
    out[section.key] = text === NOT_SPECIFIED ? "" : text;
  });
  return out;
}
