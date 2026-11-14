import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ReactFlow, ReactFlowProvider, Background, applyNodeChanges, applyEdgeChanges, useReactFlow, useStore, type Connection, type Edge, type Node, type EdgeChange, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "./api";
import { ChatNodeView } from "./ChatNodeView";
import { LensNodeView } from "./LensNodeView";
import { NodeShell } from "./NodeShell";
import { PinEdge } from "./PinEdge";
import { EdgeStatesContext } from "./pinStates";
import { NodeSearch, type NodeKind } from "./NodeSearch";
import { Sidebar } from "./Sidebar";
import { standardSize, focusZoom, focusViewport, ZOOM_OUT_FACTOR, type NodeSize } from "./nodeSize";
import { subscribeSettings } from "./displaySettings";
import { CanvasActionsContext, type Box } from "./canvasActions";
import { History } from "./history";
import { GRAPH_CHANGED } from "./graphEvents";

interface CanvasNode { id: string; type: NodeKind; position: { x: number; y: number }; size?: NodeSize }
const label = (n: CanvasNode) => `${n.type === "chat" ? "Chat Node" : "Lens Node"} — ${n.id}`;
const toFlow = (n: CanvasNode): Node => {
  const size = n.size ?? standardSize();
  return { id: n.id, type: n.type, position: n.position, data: { label: label(n) }, style: { width: size.width, height: size.height } };
};
const boxOf = (n: Node): Box => ({
  x: n.position.x,
  y: n.position.y,
  width: n.width ?? n.measured?.width ?? Number(n.style?.width) ?? 0,
  height: n.height ?? n.measured?.height ?? Number(n.style?.height) ?? 0,
});
const withBox = (n: Node, b: Box): Node => ({ ...n, position: { x: b.x, y: b.y }, width: b.width, height: b.height, style: { ...n.style, width: b.width, height: b.height } });
const isTextTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

const nodeTypes = {
  chat: ({ id, selected }: { id: string; selected?: boolean }) => <NodeShell id={id} selected={selected}><ChatNodeView id={id} /></NodeShell>,
  "exact-lens": ({ id, selected }: { id: string; selected?: boolean }) => <NodeShell id={id} selected={selected}><LensNodeView id={id} /></NodeShell>,
  "auto-lens": ({ id, selected }: { id: string; selected?: boolean }) => <NodeShell id={id} selected={selected}><LensNodeView id={id} auto /></NodeShell>,
};

export function CanvasView(props: { onClose: () => void }) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}

const edgeTypes = { default: PinEdge };

function Canvas({ onClose }: { onClose: () => void }) {
  const flow = useReactFlow();
  // Canvas Menu: screen position for drawing, Canvas position for the new Node.
  const [menu, setMenu] = useState<{ screen: { x: number; y: number }; at: { x: number; y: number } } | null>(null);
  const [searchAt, setSearchAt] = useState<{ x: number; y: number } | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const history = useRef(new History()).current;
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const dragFrom = useRef(new Map<string, { x: number; y: number }>());
  const [edgeStates, setEdgeStates] = useState<Record<string, string>>({});
  // Nodes can be worked in exactly while the Canvas is at the Focus Zoom (the tolerance absorbs rounding).
  const zoom = useStore((st) => st.transform[2]);
  const [cursorRequest, setCursorRequest] = useState<{ id: string; n: number } | null>(null);
  const [focusScale, setFocusScale] = useState(focusZoom);
  useEffect(() => {
    const onResize = () => setFocusScale(focusZoom());
    window.addEventListener("resize", onResize);
    const unsubscribe = subscribeSettings(onResize); // Window Margins changed
    return () => { window.removeEventListener("resize", onResize); unsubscribe(); };
  }, []);
  const [, setHistoryVersion] = useState(0);
  useEffect(() => history.subscribe(() => setHistoryVersion((v) => v + 1)), []);

  /** Edge State colours come from the server (derived from the node files); refetched whenever the graph or a chat/Lens changed. */
  const refreshStates = useCallback(() => api("GET", "/api/edges/states").then(setEdgeStates).catch(() => {}), []);
  useEffect(() => {
    window.addEventListener(GRAPH_CHANGED, refreshStates);
    return () => window.removeEventListener(GRAPH_CHANGED, refreshStates);
  }, [refreshStates]);
  useEffect(() => void refreshStates(), [edges.length, refreshStates]);
  // Only a white Edge (nothing has passed through it yet) can be deleted; the server enforces the same rule.
  const shownEdges = useMemo(
    () => {
      const seen = new Map<string, number>();
      return edges.map((e) => {
        // Edges into a Chat Node fill its Input Slots top to bottom, in connection order.
        const slot = nodes.find((n) => n.id === e.target)?.type === "chat" ? seen.get(e.target) ?? 0 : undefined;
        if (slot !== undefined) seen.set(e.target, slot + 1);
        return { ...e, ...(slot !== undefined ? { targetHandle: `slot${slot}` } : {}), className: `edge-${edgeStates[e.id] ?? "white"}`, deletable: (edgeStates[e.id] ?? "white") === "white" };
      });
    },
    [edges, edgeStates, nodes],
  );
  const edgeInfo = useMemo(() => ({ edges, states: edgeStates }), [edges, edgeStates]);

  useEffect(() => {
    api("GET", "/api/canvas").then((c) => {
      setNodes(c.nodes.map(toFlow));
      setEdges(c.edges.map((e: any) => ({ id: e.id, source: e.source, target: e.target })));
      // A Project opens at the Focus Zoom, centred on its first Node.
      const first: CanvasNode | undefined = c.nodes[0];
      const size = first?.size ?? standardSize();
      flow.setViewport(focusViewport(first ? first.position.x + size.width / 2 : 0, first ? first.position.y + size.height / 2 : 0));
    });
    api("GET", "/api/warnings").then(setWarnings);
  }, []);

  const reload = async () => {
    const c = await api("GET", "/api/canvas");
    setNodes(c.nodes.map(toFlow));
    setEdges(c.edges.map((e: any) => ({ id: e.id, source: e.source, target: e.target })));
  };

  /** Puts Nodes at the given boxes, locally and on the server. */
  const applyBoxes = async (boxes: Map<string, Box>) => {
    setNodes((ns) => ns.map((n) => (boxes.has(n.id) ? withBox(n, boxes.get(n.id)!) : n)));
    await Promise.all([...boxes].flatMap(([id, b]) => [
      api("PUT", `/api/nodes/${id}/size`, { size: { width: b.width, height: b.height } }),
      api("PUT", `/api/nodes/${id}/position`, { position: { x: b.x, y: b.y } }),
    ]));
  };
  const removeById = async (id: string) => {
    await api("DELETE", `/api/nodes/${id}`);
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  };
  const restoreById = async (id: string, box: Box) => {
    await api("POST", `/api/restorable/${id}/restore`, { position: { x: box.x, y: box.y } });
    await api("PUT", `/api/nodes/${id}/size`, { size: { width: box.width, height: box.height } });
    await reload();
  };
  /** Runs a change the user just made and records how to reverse and repeat it. */
  const record = (undo: () => Promise<void>, redo: () => Promise<void>) => history.push({ undo, redo });
  const boxChange = (changes: Map<string, { from: Box; to: Box }>) =>
    record(
      () => applyBoxes(new Map([...changes].map(([id, c]) => [id, c.from]))),
      () => applyBoxes(new Map([...changes].map(([id, c]) => [id, c.to]))),
    );

  /** Focus: centre the view on the Node at the Focus Zoom and put the typing cursor in it. */
  const working = zoom >= focusScale - 0.001;
  const actions = useMemo(() => ({
    working,
    cursorRequest,
    focus: (id: string) => {
      const n = nodesRef.current.find((x) => x.id === id);
      if (!n) return;
      const b = boxOf(n);
      setCursorRequest({ id, n: Date.now() });
      flow.setViewport(focusViewport(b.x + b.width / 2, b.y + b.height / 2), { duration: 300 });
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [working, cursorRequest]);

  const standardSizeAll = () => {
    const changes = new Map<string, { from: Box; to: Box }>();
    for (const n of nodesRef.current) {
      const from = boxOf(n);
      changes.set(n.id, { from, to: { ...from, ...standardSize() } });
    }
    if (changes.size === 0) return;
    boxChange(changes);
    applyBoxes(new Map([...changes].map(([id, c]) => [id, c.to])));
  };

  const run = (step: () => Promise<void>) => {
    setError("");
    step().catch((err: any) => setError(err.message));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTextTarget(e.target)) return;
      const redo = (e.code === "KeyZ" && e.shiftKey) || e.code === "KeyY";
      if (e.code !== "KeyZ" && e.code !== "KeyY") return;
      e.preventDefault();
      run(redo ? () => history.redo() : () => history.undo());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  // A picked Node type is first carried on the cursor (its top-left corner); a left click puts it down there, Esc or a right click drops it.
  const [placing, setPlacing] = useState<NodeKind | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [ghostAt, setGhostAt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: MouseEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; if (placingRef.current) setGhostAt(pointer.current); };
    window.addEventListener("mousemove", move, true);
    return () => window.removeEventListener("mousemove", move, true);
  }, []);
  const placingRef = useRef<NodeKind | null>(null);
  placingRef.current = placing;
  const pick = (type: NodeKind) => { setSearchAt(null); setGhostAt(pointer.current); setPlacing(type); };
  useEffect(() => {
    if (!placing) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: MouseEvent) => { down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as Element).closest?.(".sidebar")) return;
      e.preventDefault();
      e.stopPropagation();
      // a drag that panned the Canvas is not a placement
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      setPlacing(null);
      create(placing, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    };
    const cancel = (e: Event) => { e.preventDefault(); e.stopPropagation(); setPlacing(null); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel(e);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("contextmenu", cancel, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("contextmenu", cancel, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [placing]);

  const create = async (type: NodeKind, at: { x: number; y: number }) => {
    setError("");
    try {
      const n: CanvasNode = await api("POST", "/api/nodes", { type, position: at, size: standardSize() });
      setNodes((ns) => [...ns, toFlow(n)]);
      const box = { x: n.position.x, y: n.position.y, ...(n.size ?? standardSize()) };
      record(() => removeById(n.id), () => restoreById(n.id, box));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openMenu = (e: MouseEvent | ReactMouseEvent) => {
    e.preventDefault();
    setMenu({ screen: { x: e.clientX, y: e.clientY }, at: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
  };

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const onChange = useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    for (const c of changes) {
      if (c.type !== "remove") continue;
      const gone = nodesRef.current.find((n) => n.id === c.id);
      api("DELETE", `/api/nodes/${c.id}`);
      setEdges((es) => es.filter((e) => e.source !== c.id && e.target !== c.id));
      if (gone) {
        const box = boxOf(gone);
        record(() => restoreById(c.id, box), () => removeById(c.id));
      }
    }
  }, []);

  const createEdge = async (source: string, target: string) => {
    const e = await api("POST", "/api/edges", { source, target });
    setEdges((es) => [...es, { id: e.id, source: e.source, target: e.target }]);
  };
  const deleteEdge = async (source: string, target: string) => {
    const edge = edgesRef.current.find((x) => x.source === source && x.target === target);
    if (!edge) return;
    await api("DELETE", `/api/edges/${edge.id}`);
    setEdges((es) => es.filter((x) => x.id !== edge.id));
  };

  const onEdgesChange = async (changes: EdgeChange[]) => {
    const removed = changes.flatMap((c) => (c.type === "remove" ? [edgesRef.current.find((e) => e.id === c.id)] : [])).filter((e): e is Edge => !!e);
    setEdges((es) => applyEdgeChanges(changes.filter((c) => c.type !== "remove"), es));
    for (const { source, target } of removed) {
      setError("");
      try {
        await deleteEdge(source, target);
        record(() => createEdge(source, target), () => deleteEdge(source, target));
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  const onConnect = async (c: Connection) => {
    setError("");
    try {
      const { source, target } = c;
      await createEdge(source, target);
      record(() => deleteEdge(source, target), () => createEdge(source, target));
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="canvas">
      <Sidebar>
        <button onClick={onClose}>Change project</button>
        <button onClick={() => window.open("/?panel=models", "rc-models")}>Models</button>
        <button onClick={() => window.open("/?panel=display", "rc-display")}>Display Settings</button>
        <button onClick={standardSizeAll}>Standard Size for all Nodes</button>
      </Sidebar>
      {error && <div className="err edge-error">{error}</div>}
      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w) => (
            <div className="err warning" key={w}>Warning: {w}</div>
          ))}
        </div>
      )}
      <CanvasActionsContext.Provider value={actions}>
      <EdgeStatesContext.Provider value={edgeInfo}>
      <ReactFlow
        nodes={nodes}
        edges={shownEdges}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onChange}
        onNodeDragStart={(_, __, ns) => { dragFrom.current = new Map(ns.map((n) => [n.id, { ...n.position }])); }}
        onNodeDragStop={(_, __, ns) => {
          const changes = new Map<string, { from: Box; to: Box }>();
          for (const n of ns) {
            const start = dragFrom.current.get(n.id);
            api("PUT", `/api/nodes/${n.id}/position`, { position: n.position });
            if (!start || (start.x === n.position.x && start.y === n.position.y)) continue;
            const b = boxOf(n);
            changes.set(n.id, { from: { ...b, ...start }, to: b });
          }
          if (changes.size) boxChange(changes);
        }}
        onPaneContextMenu={openMenu}
        onPaneClick={() => setMenu(null)}
        onMoveStart={() => setMenu(null)}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode="Delete"
        // Removing a Node already takes its Edges with it (see onChange), so they are not deleted one by one.
        onBeforeDelete={async ({ nodes: ns, edges: es }) => (ns.length ? { nodes: ns, edges: [] } : { nodes: ns, edges: es })}
        minZoom={focusScale * ZOOM_OUT_FACTOR}
        maxZoom={focusScale}
        defaultViewport={{ x: 0, y: 0, zoom: focusScale }}
      >
        <Background />
      </ReactFlow>
      </EdgeStatesContext.Provider>
      </CanvasActionsContext.Provider>
      {menu && (
        <div className="canvas-menu" style={{ left: menu.screen.x, top: menu.screen.y }}>
          <button onClick={() => { setSearchAt(menu.at); setMenu(null); }}>Create node</button>
        </div>
      )}
      {searchAt && <NodeSearch onPick={pick} onClose={() => setSearchAt(null)} />}
      {placing && (() => {
        const size = standardSize();
        return <div className="placing-ghost" style={{ left: ghostAt.x, top: ghostAt.y, width: size.width * zoom, height: size.height * zoom }}>{placing === "chat" ? "Chat Node" : placing === "exact-lens" ? "Exact Lens Node" : "Auto Lens Node"}</div>;
      })()}
    </div>
  );
}
