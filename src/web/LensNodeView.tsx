import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { inputPin, outputPin, useEdgeStates } from "./pinStates";
import { Handle, Position, useStore } from "@xyflow/react";
import { api } from "./api";
import { TokenMeter, type MeterState } from "./TokenMeter";
import { GRAPH_CHANGED, graphChanged } from "./graphEvents";
import { RemoveNodeButton } from "./RemoveNodeButton";

interface ModelView { id: string; modelName: string }
type Target = { percent: number } | { tokens: number } | null;
type SectionKey = "scope" | "rules" | "discarded" | "artifacts";
type Sections = Record<SectionKey, string>;
interface LensState { model: string; sections: Sections; prompt: string; target: Target; digest: string; extractionPrompt?: string; extractionModel?: string }

/** The Handoff Questionnaire: title and guiding hint (shown in the empty field until typing starts) per section. */
const QUESTIONNAIRE: { key: SectionKey; title: string; hint: string }[] = [
  { key: "scope", title: "Project Scope & Objective", hint: "What is the core goal of this project, and what tangible result are we trying to achieve?" },
  { key: "rules", title: "Established Rules & Constraints", hint: "What mandatory technical stacks, architectural decisions, formatting standards, or style guidelines must be followed?" },
  { key: "discarded", title: "Discarded Ideas & Solved Blockers", hint: "What approaches, libraries, or ideas did you already test and reject? Why didn't they work? (This prevents the model from re-suggesting them)." },
  { key: "artifacts", title: "Current Artifacts & State", hint: "What are the latest, finalized versions of your code, outline, data schema, or drafts that the model needs to build upon? (Please paste exact, uncompressed snippets)." },
];
const noSections = (): Sections => ({ scope: "", rules: "", discarded: "", artifacts: "" });

/** A text field that grows with its text, so it never scrolls inside. */
function GrowingTextarea({ value, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} {...rest} />;
}

/** Body of an Exact or Auto Lens Node: Handoff Questionnaire, Compression Target, Model, Run, editable Digest; the Auto Lens Node adds the Extraction half. */
export function LensNodeView({ id, auto = false }: { id: string; auto?: boolean }) {
  const [state, setState] = useState<LensState>({ model: "", sections: noSections(), prompt: "", target: null, digest: "" });
  const [models, setModels] = useState<ModelView[]>([]);
  const [sections, setSections] = useState<Sections>(noSections());
  const [digest, setDigest] = useState("");
  const [editing, setEditing] = useState(false);
  const pins = useEdgeStates();
  const [kind, setKind] = useState<"percent" | "tokens">("percent");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionPrompt, setExtractionPrompt] = useState("");
  const [extractMeter, setExtractMeter] = useState<MeterState | null>(null);
  const refreshExtractMeter = () => auto && api<MeterState>("GET", `/api/nodes/${id}/lens/extraction-tokens`).then(setExtractMeter).catch(() => {});
  const [meter, setMeter] = useState<(MeterState & { input: number; prompt: number; answer: number }) | null>(null);
  // Left glass: only what goes in (connected chats + Lens Prompt), without the expected Digest.
  const inputMeter: MeterState | null = meter && { used: meter.input + meter.prompt, limit: meter.limit, estimated: meter.estimated };
  const refreshMeter = () => api<MeterState & { input: number; prompt: number; answer: number }>("GET", `/api/nodes/${id}/lens/tokens`).then(setMeter).catch(() => {});

  const load = (s: LensState) => {
    setState(s);
    setSections(s.sections);
    setDigest(s.digest);
    setExtractionPrompt(s.extractionPrompt ?? "");
    if (s.target) {
      setKind("percent" in s.target ? "percent" : "tokens");
      setAmount(String("percent" in s.target ? s.target.percent : s.target.tokens));
    }
  };
  useEffect(() => {
    api<LensState>("GET", `/api/nodes/${id}/lens`).then(load).catch((e) => setError(e.message));
    api<ModelView[]>("GET", "/api/models").then(setModels);
  }, [id]);
  // Re-read the meter whenever anything it depends on changes (settings, Run, Digest edit, new input Edge).
  const edgeCount = useStore((st) => st.edges.length);
  useEffect(() => {
    refreshMeter();
  }, [id, state.prompt, state.target, state.digest, edgeCount]);
  useEffect(() => {
    refreshExtractMeter();
  }, [id, auto, state.extractionPrompt, state.extractionModel, edgeCount]);

  // A connected chat that gains an answer changes the input (its Edge turns red): count again.
  useEffect(() => {
    const refresh = () => {
      refreshMeter();
      refreshExtractMeter();
    };
    window.addEventListener(GRAPH_CHANGED, refresh);
    return () => window.removeEventListener(GRAPH_CHANGED, refresh);
  }, [id]);

  const guard = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const save = (body: object) =>
    guard(async () => {
      const s = await api<LensState>("PUT", `/api/nodes/${id}/lens`, body);
      setState((old) => ({ ...old, model: s.model, sections: s.sections, prompt: s.prompt, target: s.target, extractionPrompt: s.extractionPrompt, extractionModel: s.extractionModel }));
      setExtractionPrompt(s.extractionPrompt ?? "");
    });
  /** A percent is held between 1 and 100; tokens only need to be positive. */
  const fit = (k: "percent" | "tokens", n: number) => (k === "percent" ? Math.min(100, Math.max(1, Math.round(n))) : Math.max(1, Math.round(n)));
  const saveTarget = (k = kind) => {
    if (amount.trim() === "" || !Number.isFinite(Number(amount))) return save({ target: null });
    const n = fit(k, Number(amount));
    setAmount(String(n));
    return save({ target: k === "percent" ? { percent: n } : { tokens: n } });
  };
  const changeKind = (k: "percent" | "tokens") => {
    setKind(k);
    saveTarget(k); // switching to percent pulls a larger number back to 100 at once
  };
  // Compression Target steps: 1% for percent, 100 for tokens; the mouse wheel over the field turns it too.
  const step = kind === "percent" ? 1 : 100;
  const wheelSave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nudge = (dir: 1 | -1) => {
    const cur = Number(amount) || 0;
    const next = kind === "percent" ? Math.min(100, Math.max(1, cur + dir * step)) : Math.max(step, Math.round((cur + dir * step) / step) * step);
    setAmount(String(next));
    clearTimeout(wheelSave.current);
    wheelSave.current = setTimeout(() => save({ target: kind === "percent" ? { percent: next } : { tokens: next } }), 400);
  };
  const run = () =>
    guard(async () => {
      setBusy(true);
      try {
        load(await api<LensState>("POST", `/api/nodes/${id}/run`));
        graphChanged();
      } finally {
        setBusy(false);
      }
    });
  const extract = () =>
    guard(async () => {
      setExtracting(true);
      try {
        load(await api<LensState>("POST", `/api/nodes/${id}/extract`));
        graphChanged();
      } finally {
        setExtracting(false);
      }
    });
  const saveDigest = () => guard(async () => {
      const s = await api<LensState>("PUT", `/api/nodes/${id}/digest`, { digest });
      setState((old) => ({ ...old, digest: s.digest }));
      graphChanged();
    });

  // A Digest edit saves itself shortly after typing stops (and at once when the field loses focus).
  useEffect(() => {
    if (digest === state.digest) return;
    const t = setTimeout(saveDigest, 800);
    return () => clearTimeout(t);
  }, [digest, state.digest]);

  const questionnaire = (
    <div className="handoff nodrag nowheel">
      <b>Context Handoff Questionnaire</b>
      {QUESTIONNAIRE.map((q) => (
        <label key={q.key}>
          <span>{q.title}</span>
          <GrowingTextarea
            value={sections[q.key]}
            placeholder={q.hint}
            onChange={(e) => setSections((old) => ({ ...old, [q.key]: e.target.value }))}
            onBlur={() => sections[q.key] !== state.sections[q.key] && save({ sections: { [q.key]: sections[q.key] } })}
          />
        </label>
      ))}
    </div>
  );
  const runRow = (
    <div className="run-row">
      <span>Compression Target</span>
      <input className="nodrag nowheel" type="number" min={step} max={kind === "percent" ? 100 : undefined} step={step} value={amount} onWheel={(e) => e.deltaY !== 0 && nudge(e.deltaY < 0 ? 1 : -1)} onChange={(e) => setAmount(e.target.value)} onBlur={() => saveTarget()} style={{ width: "4.5em" }} />
      <select className="nodrag" value={kind} onChange={(e) => changeKind(e.target.value as "percent" | "tokens")}>
        <option value="percent">% of input</option>
        <option value="tokens">tokens</option>
      </select>
      <button className="run-button" disabled={busy || extracting} onClick={run}>{busy ? "Running…" : state.digest ? "Re-Run" : "Run"}</button>
      <select className="nodrag" value={state.model} onChange={(e) => save({ modelId: e.target.value })}>
        <option value="" disabled>Choose a Model…</option>
        {models.map((m) => <option key={m.id} value={m.id}>{m.modelName}</option>)}
      </select>
    </div>
  );
  // The Digest reads as formatted Markdown; a click turns it into the plain text field, and leaving the field turns it back.
  const digestArea = editing || !digest.trim() ? (
    <textarea className="nodrag nowheel digest" placeholder="Digest" value={digest} autoFocus={editing}
      onChange={(e) => setDigest(e.target.value)}
      onBlur={() => { if (digest !== state.digest) saveDigest(); setEditing(false); }} />
  ) : (
    <div className="nodrag nowheel digest digest-view" title="Click to edit"
      onClick={() => { if (!window.getSelection()?.toString()) setEditing(true); }}>
      <Markdown text={digest} />
    </div>
  );
  const side = (
    <div className="lens-side">
      <span className="digest-size" title="Tokens of the Digest: expected from the Compression Target before Run, real after">
        Digest: {meter ? `${meter.estimated && !state.digest ? "~" : ""}${meter.answer} tokens` : "…"}
      </span>
    </div>
  );
  const inputSide = (
    <div className="lens-input-side" title="Connected chats + Lens Prompt">
      <TokenMeter meter={inputMeter} />
    </div>
  );
  const extractionHalf = (
    <div className="extract-half">
      <div className="lens-input-side" title="Connected chats + Extraction Prompt, against the Extraction Model's Context Limit">
        <TokenMeter meter={extractMeter} />
      </div>
      <div className="extract-main">
        <b>Extraction Prompt</b>
        <textarea
          className="nodrag nowheel extraction-prompt"
          value={extractionPrompt}
          onChange={(e) => setExtractionPrompt(e.target.value)}
          onBlur={() => extractionPrompt !== (state.extractionPrompt ?? "") && save({ extractionPrompt })}
        />
        <div className="run-row">
          <button className="run-button" disabled={busy || extracting} onClick={extract}>{extracting ? "Extracting…" : "Extract"}</button>
          <button disabled={extracting} onClick={() => save({ extractionPrompt: null })}>Reset prompt</button>
          <select className="nodrag" value={state.extractionModel ?? ""} onChange={(e) => save({ extractionModelId: e.target.value })}>
            <option value="" disabled>Extraction Model…</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.modelName}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  if (auto) {
    return (
      <div className="lens-node auto-lens">
        <Handle type="target" position={Position.Left} className={inputPin(pins, id)} />
        <Handle type="source" position={Position.Right} className={outputPin(pins, id)} />
        <div className="lens-top"><b className="lens-title">Auto Lens Node — {id}</b><RemoveNodeButton id={id} /></div>
        <div className="lens-halves">
          {extractionHalf}
          <div className="lens-half">
            {inputSide}
            <div className="lens-main">
              {questionnaire}
              {runRow}
            </div>
          </div>
        </div>
        <div className="lens-body digest-row">
          <div className="lens-main">{digestArea}</div>
          {side}
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    );
  }
  return (
    <div className="lens-node">
      <Handle type="target" position={Position.Left} className={inputPin(pins, id)} />
      <Handle type="source" position={Position.Right} className={outputPin(pins, id)} />
      <div className="lens-top"><b className="lens-title">Exact Lens Node — {id}</b><RemoveNodeButton id={id} /></div>
      <div className="lens-body">
        {inputSide}
        <div className="lens-main">
          {questionnaire}
          {runRow}
          {digestArea}
          {error && <div className="err">{error}</div>}
        </div>
        {side}
      </div>
    </div>
  );
}
