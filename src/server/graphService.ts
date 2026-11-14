import fs from "node:fs/promises";
import { HttpError, violationError } from "./errors";
import { exclusive } from "./fileLock";
import { checkAddEdge, checkRemoveEdge, type RuleNode } from "./graphRules";
import { addConnection, newHeader, parseLensFile, parseNodeFile, removeConnection, replaceHeader, serializeHeader, type Header } from "./nodeFile";
import { isLens, type CanvasEdge, type CanvasNode, type ProjectStore } from "./projectStore";

/** Fork and Edge operations: enforces graphRules, then records the result in canvas.json and node file headers. */
export class GraphService {
  constructor(private project: ProjectStore) {}

  private node(id: unknown): CanvasNode {
    const n = this.project.state.nodes.find((candidate) => candidate.id === id);
    if (!n) throw new HttpError(404, "no such Node");
    return n;
  }

  /** A node as the rules see it, with the file-derived facts they need (Digest present, question asked). */
  private async ruleNode(node: CanvasNode): Promise<RuleNode> {
    let text = "";
    try {
      text = await fs.readFile(this.project.fileOf(node), "utf8");
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    if (isLens(node.type)) {
      const lens = parseLensFile(text);
      return { id: node.id, type: node.type, hasDigest: lens.digest.trim() !== "", ran: !!lens.header.ran, ranInputs: Object.keys(lens.header.runInputs ?? {}) };
    }
    return { id: node.id, type: node.type, asked: parseNodeFile(text).exchanges.length > 0 };
  }

  /** Rewrites only the header of the node's file (creating a header-only file if none exists yet). */
  updateHeader(node: CanvasNode, change: (h: Header) => void): Promise<void> {
    return exclusive(node.id, async () => {
      const file = this.project.fileOf(node);
      let text = "";
      try {
        text = await fs.readFile(file, "utf8");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      const header = text
        ? parseNodeFile(text).header
        : newHeader(node.id);
      change(header);
      await fs.writeFile(file, text ? replaceHeader(text, header) : serializeHeader(header));
    });
  }

  /** Drops an Edge from both node file headers so files and canvas.json keep agreeing. */
  async forgetConnection(a: CanvasNode, b: CanvasNode) {
    await this.updateHeader(a, (h) => removeConnection(h, b.id));
    await this.updateHeader(b, (h) => removeConnection(h, a.id));
  }

  /** Fork: a new Chat Node from any Chat Node, connected to the same Lens Nodes; the source is recorded in the new file's header. */
  async fork(sourceId: unknown, position: unknown): Promise<CanvasNode & { edges: CanvasEdge[] }> {
    const source = this.node(sourceId);
    if (source.type !== "chat") throw new HttpError(400, "Only Chat Nodes can be forked");
    const p = position as any;
    const pos = p && typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : { x: source.position.x + 40, y: source.position.y + 40 };
    const node = await this.project.addNode("chat", pos);
    const sourceFile = parseNodeFile(await fs.readFile(this.project.fileOf(source), "utf8").catch(() => "")).header;
    await this.updateHeader(node, (h) => {
      h.forkedFrom = source.id;
      if (sourceFile.systemPrompt) h.systemPrompt = sourceFile.systemPrompt;
    });
    const edges: CanvasEdge[] = [];
    for (const lensId of this.project.inputsOf(source.id)) {
      if (this.project.state.nodes.find((n) => n.id === lensId)?.type === "chat") continue;
      try {
        edges.push(await this.addEdge(lensId, node.id));
      } catch (e) {
        if (!(e instanceof HttpError)) throw e; // a Lens Node that lost its Digest cannot feed the Fork
      }
    }
    return { ...node, edges };
  }

  async addEdge(sourceId: unknown, targetId: unknown, restoring = false): Promise<CanvasEdge> {
    const source = this.node(sourceId);
    const target = this.node(targetId);
    const violation = checkAddEdge(await this.ruleNode(source), await this.ruleNode(target), this.project.state.edges, restoring);
    if (violation) throw violationError(violation);
    const edge = await this.project.addEdge(source.id, target.id);
    await this.updateHeader(source, (h) => addConnection(h, target.id));
    await this.updateHeader(target, (h) => addConnection(h, source.id));
    return edge;
  }

  async removeEdge(id: string): Promise<{ ok: true }> {
    const edge = this.project.state.edges.find((e) => e.id === id);
    if (!edge) throw new HttpError(404, "no such Edge");
    const source = this.project.state.nodes.find((n) => n.id === edge.source);
    const target = this.project.state.nodes.find((n) => n.id === edge.target);
    const violation = checkRemoveEdge(source && (await this.ruleNode(source)), target && (await this.ruleNode(target)));
    if (violation) throw violationError(violation);
    await this.project.removeEdge(id);
    if (source && target) await this.forgetConnection(source, target);
    return { ok: true };
  }
}
