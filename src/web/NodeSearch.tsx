import { useEffect, useRef, useState } from "react";
import { NodeDefaultsPanel } from "./NodeDefaultsPanel";

export type NodeKind = "chat" | "exact-lens" | "auto-lens";
const OPTIONS: { kind: NodeKind; name: string }[] = [
  { kind: "chat", name: "Chat Node" },
  { kind: "exact-lens", name: "Exact Lens Node" },
  { kind: "auto-lens", name: "Auto Lens Node" },
];

/** Node Search: find a Node type by name and pick it with the mouse (Enter picks the first match). */
export function NodeSearch({ onPick, onClose }: { onPick: (kind: NodeKind) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const [defaultsOf, setDefaultsOf] = useState<NodeKind | null>(null);
  const found = OPTIONS.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="node-search" onMouseDown={(e) => e.stopPropagation()}>
        {defaultsOf ? (
          <NodeDefaultsPanel kind={defaultsOf} name={OPTIONS.find((o) => o.kind === defaultsOf)!.name} onBack={() => setDefaultsOf(null)} />
        ) : (<>
        <input
          ref={input}
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && found[0]) onPick(found[0].kind);
          }}
        />
        <ul>
          {found.map((o) => (
            <li key={o.kind} className="node-search-row">
              <button onClick={() => onPick(o.kind)}>{o.name}</button>
              <button className="gear" aria-label={`Node Defaults of ${o.name}`} title="Node Defaults" onClick={() => setDefaultsOf(o.kind)}>⚙</button>
            </li>
          ))}
          {found.length === 0 && <li className="muted">No matching nodes</li>}
        </ul>
        </>)}
      </div>
    </div>
  );
}
