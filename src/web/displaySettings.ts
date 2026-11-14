/** Display Settings: Window Margins, interface font and Interface Scale. They belong to the browser (one monitor), not to a Project. */
export interface DisplaySettings {
  left: number; right: number; top: number; bottom: number; // Window Margins, percent
  font: string;       // key of FONTS, or "custom"
  customFont: string; // a font family name, used when font is "custom"
  scale: number;      // Interface Scale, percent
}
export type MarginKey = "left" | "right" | "top" | "bottom";

export const DEFAULTS: DisplaySettings = { left: 10, right: 10, top: 5, bottom: 5, font: "system", customFont: "", scale: 100 };
export const MARGIN_RANGE = { min: 0, max: 40 };
export const SCALE_RANGE = { min: 70, max: 500 };
export const FONTS: Record<string, { label: string; stack: string }> = {
  system: { label: "System default", stack: "system-ui, sans-serif" },
  sans: { label: "Sans-serif", stack: "Arial, Helvetica, sans-serif" },
  serif: { label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  mono: { label: "Monospace", stack: "ui-monospace, Consolas, monospace" },
};

const KEY = "rc-display-settings";
const CHANGED = "rc-display-settings-changed";
const BASE_FONT_PX = 16;

/** Whether `value` is an acceptable Window Margin or Interface Scale (a value out of range is not accepted). */
export const inRange = (value: number, r: { min: number; max: number }) => Number.isFinite(value) && value >= r.min && value <= r.max;

const sane = (s: Partial<DisplaySettings>): DisplaySettings => {
  const out = { ...DEFAULTS, ...s };
  for (const k of ["left", "right", "top", "bottom"] as MarginKey[]) if (!inRange(out[k], MARGIN_RANGE)) out[k] = DEFAULTS[k];
  if (!inRange(out.scale, SCALE_RANGE)) out.scale = DEFAULTS.scale;
  if (out.font !== "custom" && !FONTS[out.font]) out.font = DEFAULTS.font;
  return out;
};

export function loadSettings(): DisplaySettings {
  try { return sane(JSON.parse(localStorage.getItem(KEY) ?? "{}")); } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: DisplaySettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(CHANGED));
}

/** Calls `fn` on every change, from this tab or another one (the Display Settings tab). */
export function subscribeSettings(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(CHANGED, fn);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(CHANGED, fn); window.removeEventListener("storage", onStorage); };
}

/** Puts the font and Interface Scale on the page: every text size is in rem, so one root size scales it all. */
export function applyToPage(s = loadSettings()) {
  const stack = s.font === "custom" && s.customFont.trim() ? `${JSON.stringify(s.customFont.trim())}, sans-serif` : FONTS[s.font === "custom" ? "system" : s.font].stack;
  document.documentElement.style.fontSize = `${(BASE_FONT_PX * s.scale) / 100}px`;
  document.documentElement.style.setProperty("--ui-font", stack);
}
