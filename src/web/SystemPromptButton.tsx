import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Gear between Fork and the trash: opens a small window for the Chat Node's System Prompt; the gear is green while it is not empty. */
export function SystemPromptButton({ id, value, onSaved }: { id: string; value: string; onSaved: (systemPrompt: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ text, value });
  latest.current = { text, value };

  const save = async (next: string) => {
    if (next === latest.current.value) return;
    try {
      const s = await api<{ systemPrompt: string }>("PUT", `/api/nodes/${id}/system-prompt`, { systemPrompt: next });
      onSaved(s.systemPrompt);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  // Saved shortly after typing stops, and at once when the window closes.
  useEffect(() => {
    if (!open || text === value) return;
    const t = setTimeout(() => save(text), 600);
    return () => clearTimeout(t);
  }, [text, open]);
  const close = () => { save(latest.current.text); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("keydown", onKey, true); };
  }, [open]);

  return (
    <span className="system-prompt nodrag" ref={box}>
      <button className={`gear${value ? " set" : ""}`} title={value ? "System Prompt (set)" : "System Prompt"} aria-label="System Prompt"
        onClick={() => (open ? close() : (setText(value), setOpen(true)))}>
        <svg className="gear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {open && (
        <div className="system-prompt-window nowheel">
          <b>System Prompt</b>
          <textarea autoFocus rows={6} value={text} placeholder="Added before every question sent to the model" onChange={(e) => setText(e.target.value)} />
          {error && <span className="err">{error}</span>}
        </div>
      )}
    </span>
  );
}
