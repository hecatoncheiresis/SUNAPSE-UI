import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, useEdges, useReactFlow, useStore, useUpdateNodeInternals } from "@xyflow/react";
import { api, apiStream } from "./api";
import { standardSize } from "./nodeSize";
import { TokenMeter, type MeterState } from "./TokenMeter";
import { graphChanged } from "./graphEvents";
import { RemoveNodeButton } from "./RemoveNodeButton";
import { Markdown } from "./Markdown";
import { SystemPromptButton } from "./SystemPromptButton";
import { inputPin, outputPin, useEdgeStates } from "./pinStates";

interface ModelView { id: string; modelName: string }
interface ChatState { model: string; systemPrompt: string; exchanges: { question: string; answer: string; model?: string }[]; forkedFrom?: string; draft?: string }

/** Body of a Chat Node: Model select (changeable at any time), Q&A list, question input. */
export function ChatNodeView({ id }: { id: string }) {
  const [state, setState] = useState<ChatState>({ model: "", systemPrompt: "", exchanges: [] });
  const [models, setModels] = useState<ModelView[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState("");
  const [loaded, setLoaded] = useState(false);
  const pins = useEdgeStates();

  useEffect(() => {
    api<ChatState>("GET", `/api/nodes/${id}/chat`).then((s) => {
      setState(s);
      setLoaded(true);
      if (s.draft) setQuestion(s.draft); // a Fork's prefilled, editable input; not stored until sent
    }).catch((e) => setError(e.message));
    api<ModelView[]>("GET", "/api/models").then(setModels);
  }, [id]);

  const fixed = state.exchanges.length > 0; // the first question closes the Input Slots

  const flow = useReactFlow();
  // Input Slots for Digests: one per attached Lens Node, plus an empty one at the bottom while slots are open.
  const attached = useEdges().filter((e) => e.target === id && flow.getNode(e.source)?.type !== "chat").length;
  const slots = attached + (fixed ? 0 : 1);
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => updateInternals(id), [id, slots, updateInternals]);
  const fork = async () => {
    setError("");
    try {
      const n = await api("POST", `/api/nodes/${id}/fork`, {});
      const size = standardSize();
      flow.addNodes({ id: n.id, type: "chat", position: n.position, data: {}, style: { width: size.width, height: size.height } });
      flow.addEdges(n.edges.map((e: { id: string; source: string; target: string }) => ({ id: e.id, source: e.source, target: e.target, deletable: false })));
      api("PUT", `/api/nodes/${n.id}/size`, { size });
      graphChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const [meter, setMeter] = useState<MeterState | null>(null);
  // Digests arrive through input Edges, so adding or deleting one changes what the meter counts.
  const inputEdges = useStore((st) => st.edges.filter((e) => e.target === id).map((e) => e.source).join());
  useEffect(() => {
    const t = setTimeout(() => {
      api<MeterState>("POST", `/api/nodes/${id}/tokens`, { pending: question }).then(setMeter).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [id, question, state, inputEdges]);


  const pickModel = async (modelId: string) => {
    setError("");
    try {
      setState(await api("PUT", `/api/nodes/${id}/model`, { modelId }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const send = async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const answer = await apiStream(`/api/nodes/${id}/messages/stream`, { question, modelId: state.model || undefined }, (d) =>
        setPartial((p) => p + d),
      );
      setState((s) => ({ ...s, exchanges: [...s.exchanges, { question, answer, model: models.find((m) => m.id === state.model)?.modelName }] }));
      setQuestion(""); // only cleared on success: a failed call keeps the typed question
      graphChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPartial("");
      setBusy(false);
    }
  };

  const qaRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // false once the user scrolled up to reread
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The chat goes to the bottom when it opens and when a question is sent (if it was at the bottom); an arriving answer never moves it.
  useLayoutEffect(() => {
    const el = qaRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [busy, loaded]);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 21 + 8)}px`; // one line, growing up to five
  }, [question]);

  return (
    <div className="chat-node">
      <Handle type="source" position={Position.Right} className={outputPin(pins, id)} />
      {Array.from({ length: slots }, (_, i) => (
        <Handle key={i} id={`slot${i}`} type="target" position={Position.Left} className={inputPin(pins, id, i)} style={{ top: `${2.75 + i * 2.75}rem` }} title={i < attached ? "Digest" : "Empty Digest slot"} />
      ))}
      <b className="node-label">Chat Node — {id}</b>
      <div className="chat-rest">
      <div className="node-top"><button onClick={fork}>Fork</button><SystemPromptButton id={id} value={state.systemPrompt} onSaved={(systemPrompt) => setState((s) => ({ ...s, systemPrompt }))} /><RemoveNodeButton id={id} /></div>
      {state.forkedFrom && <div className="fork-caption">Forked from <b>{state.forkedFrom}</b></div>}
      <div className="chat-body">
        <div className="chat-main">
          <div className="qa nodrag nowheel" ref={qaRef}
            onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
            {state.exchanges.map((x, i) => (
              <div key={i}>
                <Markdown className="q" text={x.question} />
                <Markdown className="a" text={x.answer} />
                {x.model && <span className="answer-model">{x.model}</span>}
              </div>
            ))}
            {busy && (
              <div>
                <Markdown className="q" text={question} />
                {partial ? <Markdown className="a" text={partial} /> : <p className="a"><i>…</i></p>}
              </div>
            )}
          </div>
          {error && <p className="err">{error}</p>}
          <div className="composer">
            <textarea ref={inputRef} className="nodrag nowheel" value={question} rows={1} placeholder={state.model ? "Question" : "Choose a Model first"}
              disabled={busy}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (state.model) send();
                }
              }} />
            <select className="nodrag" value={state.model} onChange={(e) => pickModel(e.target.value)}>
              <option value="" disabled>Choose a Model…</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.modelName}</option>)}
              {state.model && !models.some((m) => m.id === state.model) && <option value={state.model}>{state.model}</option>}
            </select>
          </div>
        </div>
        <TokenMeter meter={meter} />
      </div>
      </div>
    </div>
  );
}
