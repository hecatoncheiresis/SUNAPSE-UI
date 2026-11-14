import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { ChatService } from "./chatNode";
import { HttpError } from "./errors";
import { edgeStates } from "./edgeState";
import { GraphService } from "./graphService";
import { LensService } from "./lensNode";
import { RestoreService } from "./restore";
import { RecentProjects, isProject } from "./recentProjects";
import { NodeDefaultsService } from "./nodeDefaults";
import { ModelError, ModelStore, view as modelView } from "./modelStore";
import { ProjectError, ProjectStore, type NodeType } from "./projectStore";

export interface ServerOptions {
  /** Program folder data dir (Models, keys and recent Projects live here, shared by all Projects). */
  configDir: string;
  /** Older location of models.json, migrated into `configDir` when it has none. */
  legacyConfigDir?: string;
}

const isSize = (s: any) => s && typeof s.width === "number" && typeof s.height === "number" && s.width > 0 && s.height > 0;
const isPos = (p: any) => p && typeof p.x === "number" && typeof p.y === "number";

export async function createServer(opts: ServerOptions) {
  const app = Fastify();
  let project: ProjectStore | undefined;
  const recent = await RecentProjects.open(opts.configDir);
  const need = (reply: any) => {
    if (!project) {
      reply.code(409).send({ error: "No project is open" });
      return undefined;
    }
    return project;
  };

  app.post("/api/project/open", async (req, reply) => {
    const dir = (req.body as any)?.path;
    if (typeof dir !== "string" || !path.isAbsolute(dir)) return reply.code(400).send({ error: "path must be absolute" });
    try {
      project = await ProjectStore.open(dir);
    } catch (e) {
      if (e instanceof ProjectError) return reply.code(400).send({ error: e.message });
      throw e;
    }
    await recent.add(dir);
    return { path: dir, canvas: project.state, warnings: await new RestoreService(project).warnings() };
  });

  app.get("/api/projects/recent", async () => recent.list());

  app.get("/api/canvas", async (_req, reply) => {
    const p = need(reply);
    if (p) return p.state;
  });

  app.post("/api/nodes", async (req, reply) => {
    const p = need(reply);
    if (!p) return;
    const { type, position, size } = (req.body as any) ?? {};
    if ((type !== "chat" && type !== "exact-lens" && type !== "auto-lens") || !isPos(position) || (size !== undefined && !isSize(size))) return reply.code(400).send({ error: "bad node" });
    const node = await p.addNode(type as NodeType, position, size && { width: size.width, height: size.height });
    await new NodeDefaultsService(p, models).apply(node);
    return node;
  });

  app.put("/api/nodes/:id/position", async (req, reply) => {
    const p = need(reply);
    if (!p) return;
    const pos = (req.body as any)?.position;
    if (!isPos(pos)) return reply.code(400).send({ error: "bad position" });
    if (!(await p.moveNode((req.params as any).id, pos))) return reply.code(404).send({ error: "no such node" });
    return { ok: true };
  });

  app.put("/api/nodes/:id/size", async (req, reply) => {
    const p = need(reply);
    if (!p) return;
    const size = (req.body as any)?.size;
    if (!isSize(size)) return reply.code(400).send({ error: "bad size" });
    if (!(await p.resizeNode((req.params as any).id, { width: size.width, height: size.height }))) return reply.code(404).send({ error: "no such node" });
    return { ok: true };
  });

  app.delete("/api/nodes/:id", async (req, reply) => {
    const p = need(reply);
    if (!p) return;
    if (!(await p.removeNode((req.params as any).id))) return reply.code(404).send({ error: "no such node" });
    return { ok: true };
  });

  /** Runs a handler against the open project and maps service errors to their HTTP status. */
  const route = (fn: (project: ProjectStore, req: any) => Promise<unknown>) => async (req: any, reply: any) => {
    const p = need(reply);
    if (!p) return;
    try {
      return await fn(p, req);
    } catch (e) {
      if (e instanceof HttpError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  };
  const graphRoute = (fn: (g: GraphService, req: any) => Promise<unknown>) => route((p, req) => fn(new GraphService(p), req));
  const restoreRoute = (fn: (r: RestoreService, req: any) => Promise<unknown>) => route((p, req) => fn(new RestoreService(p), req));
  app.get("/api/restorable", restoreRoute((r) => r.list()));
  app.post("/api/restorable/:id/restore", restoreRoute((r, req) => r.restore(req.params.id, isPos(req.body?.position) ? req.body.position : undefined)));
  app.get("/api/warnings", restoreRoute((r) => r.warnings()));
  app.post("/api/nodes/:id/fork", graphRoute((g, req) => g.fork(req.params.id, req.body?.position)));
  app.get("/api/edges/states", route((p) => edgeStates(p)));
  app.post("/api/edges", graphRoute((g, req) => g.addEdge(req.body?.source, req.body?.target)));
  app.delete("/api/edges/:id", graphRoute((g, req) => g.removeEdge(req.params.id)));

  const chatRoute = (fn: (chat: ChatService, req: any) => Promise<unknown>) => route((p, req) => fn(new ChatService(p, models), req));
  app.get("/api/nodes/:id/chat", chatRoute((c, req) => c.state(req.params.id)));
  app.put("/api/nodes/:id/model", chatRoute((c, req) => c.setModel(req.params.id, req.body?.modelId)));
  app.put("/api/nodes/:id/system-prompt", chatRoute((c, req) => c.setSystemPrompt(req.params.id, req.body?.systemPrompt)));
  app.post("/api/nodes/:id/tokens", chatRoute((c, req) => c.meter(req.params.id, req.body?.pending)));
  app.post("/api/nodes/:id/messages", chatRoute((c, req) => c.ask(req.params.id, req.body?.question, req.body?.modelId)));

  const lensRoute = (fn: (lens: LensService, req: any) => Promise<unknown>) => route((p, req) => fn(new LensService(p, models), req));
  app.get("/api/nodes/:id/lens", lensRoute((l, req) => l.state(req.params.id)));
  app.put("/api/nodes/:id/lens", lensRoute((l, req) => l.setSettings(req.params.id, req.body)));
  app.put("/api/nodes/:id/digest", lensRoute((l, req) => l.setDigest(req.params.id, req.body?.digest)));
  app.get("/api/nodes/:id/lens/tokens", lensRoute((l, req) => l.meter(req.params.id)));
  app.get("/api/nodes/:id/lens/extraction-tokens", lensRoute((l, req) => l.extractionMeter(req.params.id)));
  app.post("/api/nodes/:id/extract", lensRoute((l, req) => l.extract(req.params.id)));
  app.post("/api/nodes/:id/run", lensRoute((l, req) => l.run(req.params.id)));

  // Streaming variant: validation errors are plain HTTP errors; once started, events are SSE `data: {json}`.
  app.post("/api/nodes/:id/messages/stream", async (req: any, reply) => {
    const p = need(reply);
    if (!p) return;
    const chat = new ChatService(p, models);
    let started = false;
    const send = (o: unknown) => reply.raw.write(`data: ${JSON.stringify(o)}\n\n`);
    const begin = () => {
      if (started) return;
      started = true;
      reply.hijack();
      reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    };
    try {
      const r = await chat.askStream(req.params.id, req.body?.question, req.body?.modelId, (d) => {
        begin();
        send({ delta: d });
      });
      begin();
      send({ done: true, answer: r.answer, usage: r.usage });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      if (!started) return reply.code(e.status).send({ error: e.message });
      send({ error: e.message });
    }
    reply.raw.end();
  });

  // Models: stored in the program folder, shared by all Projects; responses never carry the key.
  const models = await ModelStore.open(opts.configDir, opts.legacyConfigDir);
  const modelErr = (e: unknown, reply: any) => {
    if (e instanceof ModelError) return reply.code(400).send({ error: e.message });
    throw e;
  };
  app.get("/api/node-defaults/:type", route(async (p, req) => new NodeDefaultsService(p, models).get(req.params.type)));
  app.put("/api/node-defaults/:type", route(async (p, req) => new NodeDefaultsService(p, models).set(req.params.type, req.body)));

  app.get("/api/models", async () => models.list().map(modelView));
  app.get("/api/models/:id", async (req, reply) => {
    const m = models.get((req.params as any).id);
    return m ? modelView(m) : reply.code(404).send({ error: "no such model" });
  });
  app.post("/api/models", async (req, reply) => {
    try {
      return modelView(await models.create(req.body));
    } catch (e) {
      return modelErr(e, reply);
    }
  });
  app.put("/api/models/:id", async (req, reply) => {
    try {
      const m = await models.update((req.params as any).id, req.body);
      return m ? modelView(m) : reply.code(404).send({ error: "no such model" });
    } catch (e) {
      return modelErr(e, reply);
    }
  });
  app.delete("/api/models/:id", async (req, reply) => {
    if (!(await models.remove((req.params as any).id))) return reply.code(404).send({ error: "no such model" });
    return { ok: true };
  });

  // Folder browser: the server's view of the local filesystem.
  app.get("/api/fs/list", async (req, reply) => {
    const q = (req.query as any)?.path;
    const dir = typeof q === "string" && q ? q : os.homedir();
    if (!path.isAbsolute(dir)) return reply.code(400).send({ error: "path must be absolute" });
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
      const parent = path.dirname(dir);
      const projects: string[] = [];
      for (const d of dirs) if (await isProject(path.join(dir, d))) projects.push(d);
      return { path: dir, parent: parent === dir ? null : parent, dirs, projects };
    } catch {
      return reply.code(404).send({ error: "cannot read directory" });
    }
  });

  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/web");
  try {
    await fs.access(webDir);
    await app.register(fastifyStatic, { root: webDir });
  } catch {
    /* web not built yet: API only */
  }
  return app;
}
