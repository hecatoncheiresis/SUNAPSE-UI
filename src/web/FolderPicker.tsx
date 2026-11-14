import { useEffect, useState } from "react";
import { api } from "./api";
import { Markdown } from "./Markdown";
import { ACKNOWLEDGEMENTS } from "./acknowledgements";

interface Listing { path: string; parent: string | null; dirs: string[]; projects: string[] }

/** Start screen: recent Projects open with one click; folders that already are Projects open with one click too. */
export function FolderPicker({ onPick }: { onPick: (path: string) => void }) {
  const [listing, setListing] = useState<Listing>();
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  const go = (p?: string) =>
    api<Listing>("GET", `/api/fs/list${p ? `?path=${encodeURIComponent(p)}` : ""}`)
      .then((l) => { setListing(l); setError(""); })
      .catch((e) => setError(e.message));
  useEffect(() => {
    go();
    api<string[]>("GET", "/api/projects/recent").then(setRecent).catch(() => setRecent([]));
  }, []);

  if (!listing) return <p>{error || "Loading…"}</p>;
  const join = (name: string) => `${listing.path.replace(/\/$/, "")}/${name}`;
  const baseName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  return (
    <div className="start">
    <div className="picker">
      {recent.length > 0 && (
        <>
          <h2>Recent projects</h2>
          <ul>
            {recent.map((p) => <li key={p}><button onClick={() => onPick(p)} title={p}>🗂 {baseName(p)} <code>{p}</code></button></li>)}
          </ul>
        </>
      )}
      <h2>Choose the project folder</h2>
      <code>{listing.path}</code>
      {error && <p className="err">{error}</p>}
      <ul>
        {listing.parent && <li><button onClick={() => go(listing.parent!)}>⬆ ..</button></li>}
        {listing.dirs.map((d) => listing.projects.includes(d)
          ? <li key={d}><button onClick={() => onPick(join(d))}>🗂 {d}</button></li>
          : <li key={d}><button onClick={() => go(join(d))}>📁 {d}</button></li>)}
      </ul>
      <div className="row">
        <input placeholder="new folder name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button disabled={!newName.trim()} onClick={() => onPick(join(newName.trim()))}>Create project</button>
      </div>
    </div>
    <aside className="thanks">
      <h2>Acknowledgements</h2>
      <Markdown text={ACKNOWLEDGEMENTS} />
    </aside>
    </div>
  );
}
