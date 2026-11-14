import fs from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./errors";

export type NodeType = "chat" | "exact-lens" | "auto-lens";
/** Every kind of Lens Node. */
export const isLens = (type: NodeType) => type !== "chat";
export interface CanvasNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  /** Set once the Node has been given or resized to a size; absent means Standard Size. */
  size?: { width: number; height: number };
}
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}
/** Node Defaults of one type: the settings a new Node of that type starts with. */
export interface NodeDefaults {
  modelId?: string;
  /** Chat Nodes: the System Prompt a new Node starts with. */
  systemPrompt?: string;
  /** Lens Nodes: the Compression Target. */
  target?: { percent: number } | { tokens: number };
  /** Auto Lens Nodes: the Extraction Model. */
  extractionModelId?: string;
  /** Auto Lens Nodes: the Extraction Prompt a new Node starts with and Reset prompt restores. */
  extractionPrompt?: string;
}
export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Highest node number ever handed out; guarantees names are never reused. */
  lastNodeNumber: number;
  nodeDefaults?: Partial<Record<NodeType, NodeDefaults>>;
}

export const FOLDERS: Record<NodeType, string> = { chat: "chats", "exact-lens": "exact-lenses", "auto-lens": "auto-lenses" };

export class ProjectError extends Error {}

const numberOf = (id: string) => Number(/^node(\d+)$/.exec(id)?.[1] ?? 0);

export class ProjectStore {
  /** Mutations run one at a time so name allocation and canvas.json writes never interleave. */
  private queue: Promise<unknown> = Promise.resolve();

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private constructor(
    readonly dir: string,
    private canvas: Canvas,
  ) {}

  static async open(dir: string): Promise<ProjectStore> {
    await fs.mkdir(dir, { recursive: true });
    // Projects from before the Exact Lens Node: `lenses/` and `type: "lens"` are read as Exact Lens Nodes.
    try {
      await fs.rename(path.join(dir, "lenses"), path.join(dir, FOLDERS["exact-lens"]));
    } catch (e: any) {
      if (e.code !== "ENOENT" && e.code !== "ENOTEMPTY" && e.code !== "EEXIST") throw e;
    }
    for (const f of Object.values(FOLDERS)) await fs.mkdir(path.join(dir, f), { recursive: true });
    const file = path.join(dir, "canvas.json");
    let canvas: Canvas;
    let raw: string | undefined;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    if (raw === undefined) {
      canvas = { nodes: [], edges: [], lastNodeNumber: 0 };
    } else {
      try {
        canvas = { nodes: [], edges: [], lastNodeNumber: 0, ...JSON.parse(raw) };
      } catch {
        throw new ProjectError("canvas.json is not valid JSON; fix or remove it and open the project again");
      }
    }
    for (const n of canvas.nodes) if ((n.type as string) === "lens") n.type = "exact-lens";
    const store = new ProjectStore(dir, canvas);
    await store.save();
    return store;
  }

  get state(): Canvas {
    return this.canvas;
  }

  private async save() {
    await fs.writeFile(path.join(this.dir, "canvas.json"), JSON.stringify(this.canvas, null, 2));
  }

  /** Highest number used by any node file on disk, so numbers of removed-but-kept files stay taken. */
  private async highestNumberOnDisk(): Promise<number> {
    let max = 0;
    for (const f of Object.values(FOLDERS)) {
      for (const name of await fs.readdir(path.join(this.dir, f))) {
        const m = /^node(\d+)\.md$/.exec(name);
        if (m) max = Math.max(max, Number(m[1]));
      }
    }
    return max;
  }

  addNode(type: NodeType, position: { x: number; y: number }, size?: { width: number; height: number }): Promise<CanvasNode> {
    return this.serial(async () => {
      const onCanvas = Math.max(0, ...this.canvas.nodes.map((n) => numberOf(n.id)));
      const next = Math.max(this.canvas.lastNodeNumber, onCanvas, await this.highestNumberOnDisk()) + 1;
      const node: CanvasNode = { id: `node${next}`, type, position, ...(size ? { size } : {}) };
      this.canvas.lastNodeNumber = next;
      this.canvas.nodes.push(node);
      await this.save();
      return node;
    });
  }

  nodeDefaults(type: NodeType): NodeDefaults {
    return this.canvas.nodeDefaults?.[type] ?? {};
  }

  setNodeDefaults(type: NodeType, defaults: NodeDefaults): Promise<void> {
    return this.serial(async () => {
      this.canvas.nodeDefaults = { ...this.canvas.nodeDefaults, [type]: defaults };
      await this.save();
    });
  }

  /** Puts an existing node (file already on disk) back on the Canvas under its old name. */
  restoreNode(id: string, type: NodeType, position: { x: number; y: number }): Promise<CanvasNode> {
    return this.serial(async () => {
      const node: CanvasNode = { id, type, position };
      this.canvas.lastNodeNumber = Math.max(this.canvas.lastNodeNumber, numberOf(id));
      this.canvas.nodes.push(node);
      await this.save();
      return node;
    });
  }

  moveNode(id: string, position: { x: number; y: number }): Promise<boolean> {
    return this.serial(async () => {
      const n = this.canvas.nodes.find((x) => x.id === id);
      if (!n) return false;
      n.position = position;
      await this.save();
      return true;
    });
  }

  resizeNode(id: string, size: { width: number; height: number }): Promise<boolean> {
    return this.serial(async () => {
      const n = this.canvas.nodes.find((x) => x.id === id);
      if (!n) return false;
      n.size = size;
      await this.save();
      return true;
    });
  }

  addEdge(source: string, target: string): Promise<CanvasEdge> {
    return this.serial(async () => {
      const next = Math.max(0, ...this.canvas.edges.map((e) => Number(/^edge(\d+)$/.exec(e.id)?.[1] ?? 0))) + 1;
      const edge: CanvasEdge = { id: `edge${next}`, source, target };
      this.canvas.edges.push(edge);
      await this.save();
      return edge;
    });
  }

  removeEdge(id: string): Promise<void> {
    return this.serial(async () => {
      this.canvas.edges = this.canvas.edges.filter((e) => e.id !== id);
      await this.save();
    });
  }

  /** Ids of the Nodes with an Edge into `id`, in connection order. */
  inputsOf(id: string): string[] {
    return this.canvas.edges.filter((edge) => edge.target === id).map((edge) => edge.source);
  }

  /** Text of a Node file by type and id, whether or not the Node is on the Canvas (ADR-0001). A missing file is an error. */
  async readNodeFile(type: NodeType, id: string): Promise<string> {
    try {
      return await fs.readFile(path.join(this.dir, FOLDERS[type], `${id}.md`), "utf8");
    } catch (e: any) {
      if (e.code === "ENOENT") throw new HttpError(409, `${id} is not on the Canvas and its file ${FOLDERS[type]}/${id}.md is missing, so its content cannot be included`);
      throw e;
    }
  }

  /** Text of a Lens Node file, whichever kind of Lens Node it is, on the Canvas or not (ADR-0001). */
  async readLensFile(id: string): Promise<string> {
    for (const type of ["exact-lens", "auto-lens"] as const) {
      try {
        return await fs.readFile(path.join(this.dir, FOLDERS[type], `${id}.md`), "utf8");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    throw new HttpError(409, `${id} is not on the Canvas and its Lens Node file is missing, so its content cannot be included`);
  }

  fileOf(node: { id: string; type: NodeType }) {
    return path.join(this.dir, FOLDERS[node.type], `${node.id}.md`);
  }

  /** Removes the Node and its Edges from the canvas. Files are never touched (ADR-0001). */
  removeNode(id: string): Promise<boolean> {
    return this.serial(async () => {
      if (!this.canvas.nodes.some((n) => n.id === id)) return false;
      this.canvas.nodes = this.canvas.nodes.filter((n) => n.id !== id);
      this.canvas.edges = this.canvas.edges.filter((e) => e.source !== id && e.target !== id);
      await this.save();
      return true;
    });
  }
}
