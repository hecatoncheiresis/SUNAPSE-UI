import { createContext, useContext } from "react";

export interface Box { x: number; y: number; width: number; height: number }

/** What a Node's frame can ask of the Canvas, and what it needs to know: whether the Canvas is at the Focus Zoom, where Nodes can be worked in. */
export interface CanvasActions {
  /** True while the Canvas is at the Focus Zoom: every Node can be worked in. */
  working: boolean;
  /** The latest double-click Focus request; the Node it names puts the typing cursor in a field. */
  cursorRequest: { id: string; n: number } | null;
  focus(id: string): void;
}

export const CanvasActionsContext = createContext<CanvasActions | null>(null);

export const useCanvasActions = (): CanvasActions => {
  const a = useContext(CanvasActionsContext);
  if (!a) throw new Error("NodeShell must be rendered inside a Canvas");
  return a;
};
