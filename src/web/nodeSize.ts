import { loadSettings } from "./displaySettings";

export interface NodeSize { width: number; height: number }

/** Standard Size: the browser window's width and height less the four Window Margins, in Canvas units. */
export const standardSize = (): NodeSize => {
  const m = loadSettings();
  return {
    width: Math.round((window.innerWidth * (100 - m.left - m.right)) / 100),
    height: Math.round((window.innerHeight * (100 - m.top - m.bottom)) / 100),
  };
};

/** Focus Zoom: the zoom at which a Node of Standard Size fills the window between the Window Margins; the Canvas cannot be zoomed in beyond it. */
export const focusZoom = (): number => {
  const size = standardSize();
  const m = loadSettings();
  return Math.min((window.innerWidth * (100 - m.left - m.right)) / 100 / size.width, (window.innerHeight * (100 - m.top - m.bottom)) / 100 / size.height);
};

/** The viewport that puts the Canvas point (cx, cy) in the middle of the rectangle between the Window Margins (not necessarily the window's middle). */
export const focusViewport = (cx: number, cy: number) => {
  const m = loadSettings();
  const zoom = focusZoom();
  const screenX = (window.innerWidth * (m.left + 100 - m.right)) / 200;
  const screenY = (window.innerHeight * (m.top + 100 - m.bottom)) / 200;
  return { x: screenX - cx * zoom, y: screenY - cy * zoom, zoom };
};

/** The Canvas can be zoomed out to this fraction of the Focus Zoom, to see many Nodes and their Edges. */
export const ZOOM_OUT_FACTOR = 1 / 10;
