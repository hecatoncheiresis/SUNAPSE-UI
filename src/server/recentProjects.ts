import fs from "node:fs/promises";
import path from "node:path";

const MAX = 20;

/** Recently opened Projects, newest first, persisted next to the Models in the program folder. */
export class RecentProjects {
  private constructor(private file: string, private paths: string[]) {}

  static async open(dir: string): Promise<RecentProjects> {
    const file = path.join(dir, "recent-projects.json");
    let paths: string[] = [];
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf8")).projects;
      if (Array.isArray(raw)) paths = raw.filter((p) => typeof p === "string");
    } catch {
      /* none yet */
    }
    return new RecentProjects(file, paths);
  }

  async add(project: string): Promise<void> {
    this.paths = [project, ...this.paths.filter((p) => p !== project)].slice(0, MAX);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify({ projects: this.paths }, null, 2));
  }

  /** Only folders that still are Projects. */
  async list(): Promise<string[]> {
    const alive: string[] = [];
    for (const p of this.paths) if (await isProject(p)) alive.push(p);
    return alive;
  }
}

/** A Project is a folder containing canvas.json. */
export const isProject = (dir: string) =>
  fs.access(path.join(dir, "canvas.json")).then(() => true, () => false);
