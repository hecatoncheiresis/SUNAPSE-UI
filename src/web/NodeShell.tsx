import { useEffect, useRef, type ReactNode } from "react";
import { useCanvasActions } from "./canvasActions";

/** Where a double-click puts the typing cursor: the first empty Handoff Question (or the first one), else the first text field. */
function cursorTarget(root: HTMLElement): HTMLTextAreaElement | null {
  const handoff = [...root.querySelectorAll<HTMLTextAreaElement>(".handoff textarea")];
  return handoff.find((f) => f.value === "") ?? handoff[0] ?? root.querySelector("textarea");
}

/** Frame around a Node's body. The frame drags the Node; a double-click on the Node centres the view on it at the Focus Zoom. */
export function NodeShell({ id, selected, children }: { id: string; selected?: boolean; children: ReactNode }) {
  const actions = useCanvasActions();
  const ref = useRef<HTMLDivElement>(null);

  // A double-click puts the typing cursor in a field; leaving the Focus Zoom drops it.
  useEffect(() => {
    if (actions.cursorRequest?.id === id && ref.current) cursorTarget(ref.current)?.focus({ preventScroll: true });
  }, [actions.cursorRequest, id]);
  useEffect(() => {
    if (!actions.working && ref.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }, [actions.working]);

  return (
    <div
      ref={ref}
      // The wheel zooms the Canvas over any part of a Node except the text areas that scroll inside (marked nowheel).
      className={`node-shell${selected ? " selected" : ""}${actions.working ? " working" : ""}`}
      onDoubleClick={(e) => {
        const inControl = (e.target as HTMLElement).closest("textarea, input, select, button");
        if (!(actions.working && inControl)) actions.focus(id);
      }}
    >
      <div className="node-bar" />
      <div className="node-body">{children}</div>
    </div>
  );
}
