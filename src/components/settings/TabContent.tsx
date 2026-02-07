import { useState, useEffect, useRef } from "react";
import type { UseSettingsReturn } from "../../hooks/useSettings";
import type { TabId } from "./SettingsDialog";
import { TAB_ORDER } from "./SettingsDialog";
import { GeneralTab } from "./GeneralTab";
import { DeveloperTab } from "./DeveloperTab";
import { WebServerTab } from "./WebServerTab";
import { WatcherTab } from "./WatcherTab";
import { MiscellaneousTab } from "./MiscellaneousTab";

export function TabContent({
  activeTab,
  s,
  loaded,
}: {
  activeTab: TabId;
  s: UseSettingsReturn;
  loaded: boolean;
}) {
  const prevTab = useRef(activeTab);
  const [animKey, setAnimKey] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");

  useEffect(() => {
    if (activeTab === prevTab.current) return;
    const prevIdx = TAB_ORDER.indexOf(prevTab.current);
    const nextIdx = TAB_ORDER.indexOf(activeTab);
    setDirection(nextIdx > prevIdx ? "right" : "left");
    setAnimKey((k) => k + 1);
    prevTab.current = activeTab;
  }, [activeTab]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-zinc-600">Loading settings...</div>
      </div>
    );
  }

  const enterClass = direction === "right"
    ? "settings-slide-in-right"
    : "settings-slide-in-left";

  return (
    <div className="grid" style={{ gridTemplate: "1fr / 1fr" }}>
      {TAB_ORDER.map((tab) => {
        const active = tab === activeTab;
        return (
          <div
            key={active ? `${tab}-${animKey}` : tab}
            className={active ? enterClass : ""}
            style={{
              gridArea: "1 / 1",
              visibility: active ? "visible" : "hidden",
              pointerEvents: active ? "auto" : "none",
            }}
          >
            {tab === "general" && <GeneralTab s={s} />}
            {tab === "developer" && <DeveloperTab s={s} />}
            {tab === "webserver" && <WebServerTab s={s} />}
            {tab === "watcher" && <WatcherTab s={s} />}
            {tab === "miscellaneous" && <MiscellaneousTab s={s} />}
          </div>
        );
      })}
    </div>
  );
}
