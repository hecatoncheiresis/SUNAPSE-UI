import { useState } from "react";
import { useReactFlow } from "@xyflow/react";

/** Trash icon that removes the Node from the Canvas after a confirmation (its file is kept, and Ctrl+Z brings it back). */
export function RemoveNodeButton({ id }: { id: string }) {
  const flow = useReactFlow();
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span className="remove-confirm nodrag">
        <span>Remove {id} from the Canvas?</span>
        <button className="danger" onClick={() => flow.deleteElements({ nodes: [{ id }] })}>Remove</button>
        <button onClick={() => setAsking(false)}>Cancel</button>
      </span>
    );
  }
  return (
    <button className="remove-node nodrag" title="Remove Node" aria-label="Remove Node" onClick={() => setAsking(true)}>
      <svg className="remove-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
      </svg>
    </button>
  );
}
