import type { ReactNode } from "react";
import { TABS, go, useRoute, type TabId } from "../../core/route";
import { useRuntime } from "../../core/runtime";
import { SyncBadge } from "../../components/SyncBadge";
import { BootePage } from "../boote/BootePage";
import { FunkPage } from "../funk/FunkPage";
import { LagePage } from "../lage/LagePage";
import { SettingsPage } from "../einstellungen/SettingsPage";

const PAGES: Record<TabId, (props: { rest: string[] }) => ReactNode> = {
  lage: () => <LagePage />,
  boote: ({ rest }) => <BootePage rest={rest} />,
  einsaetze: () => <Placeholder />,
  funk: () => <FunkPage />,
  personal: () => <Placeholder />,
  einstellungen: () => <SettingsPage />,
};

function Placeholder() {
  return <p className="empty">Dieser Bereich folgt.</p>;
}

export function App() {
  const route = useRoute();
  const runtime = useRuntime();
  const Page = PAGES[route.tab];
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">ELS Dahme</span>
        {runtime.mode === "demo" && <span className="demo-note">Demo – Daten nur lokal</span>}
        <span className="spacer" />
        <SyncBadge />
      </header>
      <nav className="tabs" aria-label="Bereiche">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === route.tab ? "tab active" : "tab"}
            aria-current={tab.id === route.tab ? "page" : undefined}
            onClick={() => go(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className={`page page-${route.tab}`}>
        <Page rest={route.rest} />
      </main>
    </div>
  );
}
