import { ChatService } from "./chatNode";
import { HttpError } from "./errors";
import { LensService, validateTarget } from "./lensNode";
import type { ModelStore } from "./modelStore";
import type { CanvasNode, NodeDefaults, NodeType, ProjectStore } from "./projectStore";

export const isNodeType = (type: unknown): type is NodeType => type === "chat" || type === "exact-lens" || type === "auto-lens";

/** Node Defaults: the settings a newly created Node of each type starts with in a Project. */
export class NodeDefaultsService {
  constructor(private project: ProjectStore, private models: ModelStore) {}

  private typeOf(type: unknown): NodeType {
    if (!isNodeType(type)) throw new HttpError(404, "no such Node type");
    return type;
  }

  get(type: unknown): NodeDefaults {
    return this.project.nodeDefaults(this.typeOf(type));
  }

  async set(type: unknown, body: any): Promise<NodeDefaults> {
    const nodeType = this.typeOf(type);
    const defaults: NodeDefaults = {};
    if (body?.modelId) {
      if (typeof body.modelId !== "string" || !this.models.get(body.modelId)) throw new HttpError(400, "Unknown Model");
      defaults.modelId = body.modelId;
    }
    if (body?.systemPrompt) {
      if (nodeType !== "chat") throw new HttpError(400, "Only a Chat Node has a System Prompt");
      if (typeof body.systemPrompt !== "string") throw new HttpError(400, "systemPrompt must be text");
      defaults.systemPrompt = body.systemPrompt;
    }
    if (body?.extractionModelId) {
      if (nodeType !== "auto-lens") throw new HttpError(400, "Only an Auto Lens Node has an Extraction Model");
      if (typeof body.extractionModelId !== "string" || !this.models.get(body.extractionModelId)) throw new HttpError(400, "Unknown Model");
      defaults.extractionModelId = body.extractionModelId;
    }
    if (body?.extractionPrompt) {
      if (nodeType !== "auto-lens") throw new HttpError(400, "Only an Auto Lens Node has an Extraction Prompt");
      if (typeof body.extractionPrompt !== "string") throw new HttpError(400, "extractionPrompt must be text");
      defaults.extractionPrompt = body.extractionPrompt;
    }
    if (body?.target) {
      if (nodeType === "chat") throw new HttpError(400, "A Chat Node has no Compression Target");
      defaults.target = validateTarget(body.target);
    }
    await this.project.setNodeDefaults(nodeType, defaults);
    return defaults;
  }

  /** Gives a freshly created Node its type's Defaults. A Model that no longer exists leaves the setting empty. */
  async apply(node: CanvasNode): Promise<void> {
    const { modelId, target, extractionModelId, extractionPrompt, systemPrompt } = this.project.nodeDefaults(node.type);
    const exists = (id: string | undefined) => (id && this.models.get(id) ? id : undefined);
    const model = exists(modelId);
    if (node.type === "chat") {
      const chat = new ChatService(this.project, this.models);
      if (model) await chat.setModel(node.id, model);
      if (systemPrompt) await chat.setSystemPrompt(node.id, systemPrompt);
    } else {
      const settings = { modelId: model, target, extractionModelId: exists(extractionModelId), extractionPrompt };
      await new LensService(this.project, this.models).setSettings(node.id, node.type === "auto-lens" ? settings : { modelId: model, target });
    }
  }
}
