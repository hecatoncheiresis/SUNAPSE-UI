import type { NodeType, ProjectStore } from "./projectStore";
import { parseLensFile, parseNodeFile } from "./nodeFile";

export type EdgeColour = "white" | "green" | "red";

const fileOrEmpty = async (project: ProjectStore, type: NodeType, id: string) => {
  try {
    return await project.readNodeFile(type, id);
  } catch {
    return "";
  }
};

/** Edge State of every Edge on the Canvas, derived from the node files (nothing about it is stored separately). */
export async function edgeStates(project: ProjectStore): Promise<Record<string, EdgeColour>> {
  const out: Record<string, EdgeColour> = {};
  for (const edge of project.state.edges) {
    const source = project.state.nodes.find((n) => n.id === edge.source);
    const target = project.state.nodes.find((n) => n.id === edge.target);
    if (!source || !target) continue;
    if (source.type === "chat") {
      const chat = parseNodeFile(await fileOrEmpty(project, "chat", source.id));
      const lens = parseLensFile(await fileOrEmpty(project, target.type, target.id));
      const seen = lens.header.runInputs?.[source.id];
      out[edge.id] = seen === undefined ? "white" : seen === chat.exchanges.length ? "green" : "red";
    } else {
      const lens = parseLensFile(await fileOrEmpty(project, source.type, source.id));
      const chat = parseNodeFile(await fileOrEmpty(project, "chat", target.id));
      const recorded = chat.digests.find((d) => d.source === source.id);
      out[edge.id] = !recorded ? "white" : recorded.text === lens.digest ? "green" : "red";
    }
  }
  return out;
}
