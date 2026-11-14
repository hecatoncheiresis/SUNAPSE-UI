import fs from "node:fs/promises";
import path from "node:path";

export interface Model {
  id: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  /** Context Limit in tokens. */
  contextLimit: number;
}

/** What the API exposes: never the key. */
export type ModelView = Omit<Model, "apiKey"> & { hasKey: boolean };

export class ModelError extends Error {}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const posInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

export const view = ({ apiKey, ...rest }: Model): ModelView => ({ ...rest, hasKey: apiKey !== "" });

/** Models and their keys, persisted in the program folder (shared by all Projects, outside any Project). */
export class ModelStore {
  private constructor(private file: string, private models: Model[], private nextId: number) {}

  /** `legacyDir`: an older location whose models.json is copied over when `configDir` has none yet. */
  static async open(configDir: string, legacyDir?: string): Promise<ModelStore> {
    const file = path.join(configDir, "models.json");
    let models: Model[] = [];
    const read = async (f: string): Promise<Model[] | undefined> => {
      try {
        return JSON.parse(await fs.readFile(f, "utf8")).models ?? [];
      } catch {
        return undefined;
      }
    };
    const own = await read(file);
    const migrated = own === undefined && legacyDir ? await read(path.join(legacyDir, "models.json")) : undefined;
    models = own ?? migrated ?? [];
    const max = models.reduce((m, x) => Math.max(m, Number(x.id.replace(/\D/g, "")) || 0), 0);
    const store = new ModelStore(file, models, max + 1);
    if (migrated) await store.save();
    return store;
  }

  private async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify({ models: this.models }, null, 2), { mode: 0o600 });
  }

  list(): Model[] {
    return this.models;
  }

  get(id: string): Model | undefined {
    return this.models.find((m) => m.id === id);
  }

  async create(input: any): Promise<Model> {
    if (!nonEmpty(input?.baseUrl)) throw new ModelError("baseUrl is required");
    if (!nonEmpty(input?.modelName)) throw new ModelError("modelName is required");
    if (!posInt(input?.contextLimit)) throw new ModelError("contextLimit must be a positive integer (tokens)");
    if (input.apiKey !== undefined && typeof input.apiKey !== "string") throw new ModelError("apiKey must be a string");
    const m: Model = {
      id: `model${this.nextId++}`,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey ?? "",
      modelName: input.modelName,
      contextLimit: input.contextLimit,
    };
    this.models.push(m);
    await this.save();
    return m;
  }

  /** Partial update; an omitted apiKey keeps the stored one. */
  async update(id: string, input: any): Promise<Model | undefined> {
    const m = this.get(id);
    if (!m) return undefined;
    if (input?.baseUrl !== undefined && !nonEmpty(input.baseUrl)) throw new ModelError("baseUrl is required");
    if (input?.modelName !== undefined && !nonEmpty(input.modelName)) throw new ModelError("modelName is required");
    if (input?.contextLimit !== undefined && !posInt(input.contextLimit)) throw new ModelError("contextLimit must be a positive integer (tokens)");
    if (input?.apiKey !== undefined && typeof input.apiKey !== "string") throw new ModelError("apiKey must be a string");
    for (const k of ["baseUrl", "modelName", "contextLimit", "apiKey"] as const) {
      if (input?.[k] !== undefined) (m as any)[k] = input[k];
    }
    await this.save();
    return m;
  }

  async remove(id: string): Promise<boolean> {
    const i = this.models.findIndex((m) => m.id === id);
    if (i < 0) return false;
    this.models.splice(i, 1);
    await this.save();
    return true;
  }
}
