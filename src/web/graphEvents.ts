/** Fired when something that changes an Edge State happened (an answer, a Run, a Digest edit); the Canvas refetches the colours. */
export const GRAPH_CHANGED = "rc-graph-changed";
export const graphChanged = () => window.dispatchEvent(new Event(GRAPH_CHANGED));
