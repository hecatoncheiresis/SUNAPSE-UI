import { useState, type ReactNode } from "react";

const KEY = "rc-sidebar-collapsed";
const read = () => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

/** Translucent collapsible panel at the left edge; its open/closed state is remembered per browser. */
export function Sidebar({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(read);
  const toggle = () => {
    setCollapsed(!collapsed);
    try { localStorage.setItem(KEY, collapsed ? "0" : "1"); } catch { /* storage unavailable */ }
  };
  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <button className="sidebar-toggle" onClick={toggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? "›" : "‹"}
      </button>
      {!collapsed && <div className="sidebar-body">{children}</div>}
    </aside>
  );
}
