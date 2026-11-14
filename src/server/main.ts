import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./app";

const port = Number(process.env.PORT ?? 3100);
// Models and recent Projects live in the program folder (the repo root), shared by all Projects.
const programDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configDir = process.env.RC_CONFIG_DIR ?? programDir;
const legacyConfigDir = path.join(os.homedir(), ".config", "reasoning-canvas");
const app = await createServer({ configDir, legacyConfigDir });
await app.listen({ port, host: "127.0.0.1" });
console.log(`Reasoning Canvas: http://127.0.0.1:${port}`);
