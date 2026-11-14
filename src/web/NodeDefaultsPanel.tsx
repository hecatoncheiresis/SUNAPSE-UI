import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { NodeKind } from "./NodeSearch";

interface ModelView { id: string; modelName: string }
interface Defaults {
  modelId?: string;
  systemPrompt?: string;
  extractionModelId?: string;
  extractionPrompt?: string;
  target?: { percent: number } | { tokens: number };
}
type Draft = { modelId: string; systemPrompt: string; extractionModelId: string; extractionPrompt: string; mode: "" | "percent" | "tokens"; amount: string };

const toDraft = (d: Defaults): Draft => ({
  modelId: d.modelId ?? "",
  systemPrompt: d.systemPrompt ?? "",
  extractionModelId: d.extractionModelId ?? "",
  extractionPrompt: d.extractionPrompt ?? "",
  mode: d.target ? ("percent" in d.target ? "percent" : "tokens") : "",
  amount: d.target ? String("percent" in d.target ? d.target.percent : d.target.tokens) : "",
});
const toBody = (kind: NodeKind, d: Draft, models: ModelView[]) => {
  const known = (id: string) => (models.some((m) => m.id === id) ? id : undefined); // a deleted Model shows as not chosen
  return {
    modelId: known(d.modelId),
    ...(kind === "chat" ? { systemPrompt: d.systemPrompt || undefined } : {}),
    ...(kind === "auto-lens" ? { extractionModelId: known(d.extractionModelId), extractionPrompt: d.extractionPrompt || undefined } : {}),
    ...(kind !== "chat" && d.mode ? { target: { [d.mode]: Number(d.amount) } } : {}),
  };
};

/** Node Defaults of one Node type: saved at once, no Save button. */
export function NodeDefaultsPanel({ kind, name, onBack }: { kind: NodeKind; name: string; onBack: () => void }) {
  const [models, setModels] = useState<ModelView[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const latest = useRef<Draft | null>(null);
  latest.current = draft;

  useEffect(() => {
    Promise.all([api<ModelView[]>("GET", "/api/models"), api<Defaults>("GET", `/api/node-defaults/${kind}`)])
      .then(([m, d]) => { setModels(m); setDraft(toDraft(d)); })
      .catch((e) => setError(e.message));
  }, [kind]);

  const save = async (next: Draft) => {
    setDraft(next);
    try {
      await api("PUT", `/api/node-defaults/${kind}`, toBody(kind, next, models));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  const flush = () => latest.current && save(latest.current);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      flush();
      onBack();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  if (!draft) return <div className="node-defaults"><div className="muted">{error || "Loading…"}</div></div>;

  const modelSelect = (label: string, key: "modelId" | "extractionModelId") => (
    <label>{label}
      <select value={models.some((m) => m.id === draft[key]) ? draft[key] : ""} onChange={(e) => save({ ...draft, [key]: e.target.value })}>
        <option value="">Not chosen</option>
        {models.map((m) => <option key={m.id} value={m.id}>{m.modelName}</option>)}
      </select>
    </label>
  );

  return (
    <div className="node-defaults">
      <div className="node-defaults-head">
        <button onClick={() => { flush(); onBack(); }}>← Back</button>
        <b>Node Defaults — {name}</b>
      </div>
      {modelSelect(kind === "auto-lens" ? "Model (Run)" : "Model", "modelId")}
      {kind === "chat" && (
        <label>System Prompt
          <textarea rows={6} placeholder="Added before every question of a new Chat Node" value={draft.systemPrompt}
            onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} onBlur={flush} />
        </label>
      )}
      {kind === "auto-lens" && modelSelect("Extraction Model", "extractionModelId")}
      {kind === "auto-lens" && (
        <label>Extraction Prompt
          <textarea rows={6} placeholder="Built-in Extraction Prompt" value={draft.extractionPrompt}
            onChange={(e) => setDraft({ ...draft, extractionPrompt: e.target.value })} onBlur={flush} />
        </label>
      )}
      {kind !== "chat" && (
        <label>Compression Target
          <span className="row">
            <select value={draft.mode} onChange={(e) => save({ ...draft, mode: e.target.value as Draft["mode"], amount: e.target.value ? draft.amount || "50" : "" })}>
              <option value="">Not set</option>
              <option value="percent">Percent</option>
              <option value="tokens">Tokens</option>
            </select>
            {draft.mode && <input type="number" min={1} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} onBlur={flush} />}
          </span>
        </label>
      )}
      <button onClick={() => save(toDraft({}))}>Restore built-in values</button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
