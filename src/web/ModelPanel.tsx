import { useEffect, useState } from "react";
import { api } from "./api";

interface ModelView { id: string; baseUrl: string; modelName: string; contextLimit: number; hasKey: boolean }
const empty = { baseUrl: "", apiKey: "", modelName: "", contextLimit: "" };

/** Panel (opened in its own browser tab) for managing Models. Keys are write-only. */
export function ModelPanel() {
  const [models, setModels] = useState<ModelView[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // model id, or "new"
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  const load = () => api<ModelView[]>("GET", "/api/models").then(setModels);
  useEffect(() => void load(), []);

  const edit = (m?: ModelView) => {
    setError("");
    setEditing(m ? m.id : "new");
    setForm(m ? { baseUrl: m.baseUrl, apiKey: "", modelName: m.modelName, contextLimit: String(m.contextLimit) } : empty);
  };

  const save = async () => {
    const body: any = { baseUrl: form.baseUrl, modelName: form.modelName, contextLimit: Number(form.contextLimit) };
    if (form.apiKey !== "" || editing === "new") body.apiKey = form.apiKey; // blank on edit keeps the stored key
    try {
      await (editing === "new" ? api("POST", "/api/models", body) : api("PUT", `/api/models/${editing}`, body));
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    await api("DELETE", `/api/models/${id}`);
    await load();
  };

  const field = (k: keyof typeof empty, label: string, type = "text") => (
    <label>
      {label}
      <input type={type} value={form[k]} placeholder={k === "apiKey" && editing !== "new" ? "(unchanged)" : ""}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </label>
  );

  return (
    <div className="model-panel">
      <h2>Models</h2>
      <ul>
        {models.map((m) => (
          <li key={m.id}>
            <b>{m.modelName}</b> — {m.baseUrl} — limit {m.contextLimit} tokens — {m.hasKey ? "key set" : "no key"}{" "}
            <button onClick={() => edit(m)}>Edit</button> <button onClick={() => remove(m.id)}>Delete</button>
          </li>
        ))}
      </ul>
      {editing === null ? (
        <button onClick={() => edit()}>+ Add Model</button>
      ) : (
        <div className="model-form">
          {field("baseUrl", "Base URL")}
          {field("apiKey", "API key", "password")}
          {field("modelName", "Model name")}
          {field("contextLimit", "Context Limit (tokens)", "number")}
          {error && <p className="err">{error}</p>}
          <button onClick={save}>Save</button> <button onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
