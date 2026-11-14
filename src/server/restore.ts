import fs from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./errors";
import { GraphService } from "./graphService";
import { parseNodeFile, type Header } from "./nodeFile";
import { FOLDERS, isLens, type CanvasNode, type NodeType, type ProjectStore } from "./projectStore";

export interface Restorable {
  id: string;
  type: NodeType;
}

/** Restore menu and warnings: everything that compares canvas.json with the node files (ADR-0001). */
export class RestoreService {
  constructor(private project: ProjectStore) {}

  private async headerOf(type: NodeType, id: string): Promise<Header | undefined> {
    try {
      return parseNodeFile(await fs.readFile(path.join(this.project.dir, FOLDERS[type], `${id}.md`), "utf8")).header;
    } catch (e: any) {
      if (e.code === "ENOENT") return undefined;
      throw e;
    }
  }

  /** Nodes whose files exist in chats/, exact-lenses/ or auto-lenses/ but which are not on the Canvas. */
  async list(): Promise<Restorable[]> {
    const onCanvas = new Set(this.project.state.nodes.map((n) => n.id));
    const out: Restorable[] = [];
    for (const type of Object.keys(FOLDERS) as NodeType[]) {
      for (const name of await fs.readdir(path.join(this.project.dir, FOLDERS[type]))) {
        const id = /^(node\d+)\.md$/.exec(name)?.[1];
        if (!id || onCanvas.has(id)) continue;
        out.push({ id, type });
      }
    }
    return out.sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)));
  }

  /** Puts the Node back and rebuilds the recorded Edges whose other end is on the Canvas and which the rules allow. */
  async restore(id: string, position?: { x: number; y: number }): Promise<CanvasNode> {
    const entry = (await this.list()).find((r) => r.id === id);
    if (!entry) throw new HttpError(404, "no such Node to restore");
    const header = (await this.headerOf(entry.type, id))!;
    const n = this.project.state.nodes.length;
    const node = await this.project.restoreNode(id, entry.type, position ?? { x: 80 + n * 30, y: 80 + n * 30 });
    const graph = new GraphService(this.project);
    for (const otherId of header.connections) {
      const other = this.project.state.nodes.find((x) => x.id === otherId);
      if (!other) continue; // stays recorded in the files for a later Restore of that Node
      const [source, target] = entry.type === "chat" ? [node, other] : [other, node];
      if (isLens(source.type) === isLens(target.type)) {
        await graph.forgetConnection(node, other);
        continue;
      }
      try {
        await graph.addEdge(source.id, target.id, true);
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        await graph.forgetConnection(node, other); // no longer allowed: the files must agree with the Canvas
      }
    }
    return node;
  }

  /** One warning per Node file whose Connections differ from canvas.json (for Nodes on the Canvas). */
  async warnings(): Promise<string[]> {
    const { nodes, edges } = this.project.state;
    const ids = new Set(nodes.map((n) => n.id));
    const neighbours = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
    for (const e of edges) {
      neighbours.get(e.source)?.add(e.target);
      neighbours.get(e.target)?.add(e.source);
    }
    const out: string[] = [];
    for (const n of nodes) {
      const recorded = new Set((await this.headerOf(n.type, n.id))?.connections ?? []);
      for (const o of neighbours.get(n.id)!) {
        if (!recorded.has(o)) out.push(`${n.id}.md does not record its Edge to ${o}, but canvas.json has it; canvas.json wins`);
      }
      for (const o of recorded) {
        if (ids.has(o) && !neighbours.get(n.id)!.has(o)) out.push(`${n.id}.md records an Edge to ${o}, but canvas.json has none; canvas.json wins`);
      }
    }
    return out;
  }
}
