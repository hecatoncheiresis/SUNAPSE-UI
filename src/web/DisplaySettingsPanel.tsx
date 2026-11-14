import { useEffect, useState } from "react";
import {
  DEFAULTS, FONTS, MARGIN_RANGE, SCALE_RANGE, inRange, loadSettings, saveSettings,
  type DisplaySettings, type MarginKey,
} from "./displaySettings";

const MARGINS: { key: MarginKey; label: string }[] = [
  { key: "left", label: "Left margin (% of window width)" },
  { key: "right", label: "Right margin (% of window width)" },
  { key: "top", label: "Top margin (% of window height)" },
  { key: "bottom", label: "Bottom margin (% of window height)" },
];

/** A number field that accepts only values in range: an out-of-range entry is not applied and the field returns to the last accepted value on leaving it. */
function NumberField({ label, value, range, onAccept }: { label: string; value: number; range: { min: number; max: number }; onAccept: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const bad = draft.trim() === "" || !inRange(Number(draft), range);
  return (
    <label>
      <span>{label}</span>
      <input
        type="number" min={range.min} max={range.max} step={1} value={draft} className={bad ? "invalid" : ""}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim() !== "" && inRange(Number(e.target.value), range)) onAccept(Number(e.target.value));
        }}
        onBlur={() => setDraft(String(value))}
      />
      <small className="muted">{range.min}–{range.max}%</small>
    </label>
  );
}

/** Display Settings: a full-screen tab, opened from the Sidebar, where the interface is adapted to a monitor. Changes apply at once. */
export function DisplaySettingsPanel() {
  const [s, setS] = useState<DisplaySettings>(loadSettings);
  const update = (patch: Partial<DisplaySettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  };
  const close = () => window.close();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="display-settings">
      <h2>Display Settings</h2>
      <p className="muted">Nodes keep their size until “Standard Size for all Nodes” is used in the Sidebar.</p>
      <div className="grid">
        {MARGINS.map((m) => (
          <NumberField key={m.key} label={m.label} value={s[m.key]} range={MARGIN_RANGE} onAccept={(n) => update({ [m.key]: n })} />
        ))}
        <label>
          <span>Interface font</span>
          <select value={s.font} onChange={(e) => update({ font: e.target.value })}>
            {Object.entries(FONTS).map(([key, f]) => <option key={key} value={key}>{f.label}</option>)}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {s.font === "custom" ? (
          <label>
            <span>Font family name</span>
            <input value={s.customFont} placeholder="e.g. Inter" onChange={(e) => update({ customFont: e.target.value })} />
          </label>
        ) : <span />}
        <NumberField label="Interface Scale (%)" value={s.scale} range={SCALE_RANGE} onAccept={(n) => update({ scale: n })} />
      </div>
      <div className="row">
        <button onClick={() => update({ ...DEFAULTS })}>Reset to defaults</button>
        <button onClick={close}>Back to Canvas</button>
      </div>
    </div>
  );
}
