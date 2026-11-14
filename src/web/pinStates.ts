import { createContext, useContext } from "react";

export type PinState = "white" | "green" | "red";
/** Edges of the Canvas in connection order, with their Edge States. */
export interface EdgeStateInfo {
  edges: { id: string; source: string; target: string }[];
  states: Record<string, string>;
}
export const EdgeStatesContext = createContext<EdgeStateInfo>({ edges: [], states: {} });

const stateOf = (info: EdgeStateInfo, id: string): PinState => (info.states[id] as PinState) ?? "white";

/** The worst of several Edge States: red, else white, else green. */
function worst(states: PinState[]): PinState | undefined {
  if (!states.length) return undefined;
  return states.includes("red") ? "red" : states.includes("white") ? "white" : "green";
}

/** Colour class of a Node's output pin (worst of its Edges), or "" when it has none. */
export function outputPin(info: EdgeStateInfo, nodeId: string): string {
  const w = worst(info.edges.filter((e) => e.source === nodeId).map((e) => stateOf(info, e.id)));
  return w ? `pin-${w}` : "";
}
/** Colour class of the input pin number `slot` (the slot-th incoming Edge); with no `slot`, the worst of all incoming Edges. */
export function inputPin(info: EdgeStateInfo, nodeId: string, slot?: number): string {
  const incoming = info.edges.filter((e) => e.target === nodeId);
  const w = slot === undefined ? worst(incoming.map((e) => stateOf(info, e.id))) : incoming[slot] && stateOf(info, incoming[slot].id);
  return w ? `pin-${w}` : "";
}
export const useEdgeStates = () => useContext(EdgeStatesContext);
