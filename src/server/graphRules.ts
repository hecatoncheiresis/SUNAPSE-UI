/** Pure graph rules: which Edges may exist, when they may be removed, and when they stay. */

export type NodeKind = "chat" | "exact-lens" | "auto-lens";
const isLens = (type: NodeKind) => type !== "chat";
export interface RuleNode {
  id: string;
  type: NodeKind;
  /** Lens Nodes: whether the Digest has any text. */
  hasDigest?: boolean;
  /** Lens Nodes: whether the Lens Node has been Run at least once. */
  ran?: boolean;
  /** Lens Nodes: the Chat Nodes whose Dialogues the last Run took in. */
  ranInputs?: string[];
  /** Chat Nodes: whether a first question was already asked (Input Slots are closed). */
  asked?: boolean;
}
export interface RuleEdge {
  source: string;
  target: string;
}
/** A violation: `conflict` = state forbids it (409), `invalid` = the request is never allowed (400). */
export interface Violation {
  kind: "invalid" | "conflict";
  message: string;
}

/** `restoring`: the Edge existed before the Node was removed, so the target's already-asked state does not forbid it. */
export function checkAddEdge(source: RuleNode, target: RuleNode, existing: RuleEdge[], restoring = false): Violation | undefined {
  if (source.id === target.id) return { kind: "invalid", message: "A Node cannot be connected to itself by an Edge" };
  if (source.type === "chat" && target.type === "chat") return { kind: "invalid", message: "Chat -> Chat Edges are not allowed" };
  if (isLens(source.type) && isLens(target.type)) return { kind: "invalid", message: "Lens Node -> Lens Node Edges are not allowed" };
  if (isLens(source.type)) {
    if (!source.hasDigest) return { kind: "invalid", message: "Only a Lens Node with a Digest can have an Edge to a Chat Node" };
    if (!restoring && target.asked) return { kind: "conflict", message: "Digests can only be attached before the first question" };
  }
  if (existing.some((e) => e.source === source.id && e.target === target.id)) return { kind: "invalid", message: "These Nodes already have an Edge" };
  return undefined;
}

/** An Edge shows where information came from, so it stays once that information was taken in. */
export function checkRemoveEdge(source: RuleNode | undefined, target: RuleNode | undefined): Violation | undefined {
  if (source && isLens(source.type) && target?.asked) return { kind: "conflict", message: "The chat already took in this Digest with its first question; the Edge stays" };
  if (source?.type === "chat" && target?.ranInputs?.includes(source.id)) return { kind: "conflict", message: "This Lens Node was already Run; the Edge to its input stays" };
  return undefined;
}

export function checkLensChange(node: RuleNode): Violation | undefined {
  if (!isLens(node.type)) return { kind: "invalid", message: "Not a Lens Node" };
  return undefined;
}
