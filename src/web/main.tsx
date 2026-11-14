import { useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { FolderPicker } from "./FolderPicker";
import { CanvasView } from "./CanvasView";
import { ModelPanel } from "./ModelPanel";
import { DisplaySettingsPanel } from "./DisplaySettingsPanel";
import { applyToPage, subscribeSettings } from "./displaySettings";
import "./style.css";

function App() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const pick = (path: string) =>
    api("POST", "/api/project/open", { path }).then(() => setOpen(true)).catch((e) => setError(e.message));
  return open ? (
    <CanvasView onClose={() => setOpen(false)} />
  ) : (
    <>
      {error && <p className="err">{error}</p>}
      <FolderPicker onPick={pick} />
    </>
  );
}
const panel = new URLSearchParams(location.search).get("panel");
applyToPage();
subscribeSettings(() => applyToPage());
createRoot(document.getElementById("root")!).render(panel === "models" ? <ModelPanel /> : panel === "display" ? <DisplaySettingsPanel /> : <App />);
