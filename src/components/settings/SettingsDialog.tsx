import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useSettings } from "../../hooks/useSettings";
import { useModalClose } from "../../hooks/useModalClose";
import { TabBar } from "./TabBar";
import { TabContent } from "./TabContent";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onSettingsChanged?: () => void;
}

export type TabId = "general" | "developer" | "webserver" | "watcher" | "miscellaneous";

export const TAB_ORDER: TabId[] = ["general", "developer", "webserver", "watcher", "miscellaneous"];

export interface TabDef {
  id: TabId;
  label: string;
  icon: ReactNode;
  hidden?: boolean;
}

export function SettingsDialog({ open, onClose, onSettingsChanged }: SettingsDialogProps) {
  const closeAndNotify = useCallback(() => {
    onClose();
    onSettingsChanged?.();
  }, [onClose, onSettingsChanged]);
  const { visible, closing, handleClose } = useModalClose(open, closeAndNotify);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const s = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      s.load();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeTab]);

  if (!visible) return null;

  const devMode = s.getBool("Developer", "DevMode");
  const wsEnabled = s.getBool("Developer", "EnableWebServer");

  const tabs: TabDef[] = [
    {
      id: "general",
      label: "General",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      id: "developer",
      label: "Developer",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
    },
    {
      id: "webserver",
      label: "WebServer",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      ),
      hidden: !devMode && !wsEnabled,
    },
    {
      id: "watcher",
      label: "Watcher",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      id: "miscellaneous",
      label: "Misc",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      ),
    },
  ];

  const visibleTabs = tabs.filter((t) => !t.hidden);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${closing ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={handleClose}
    >
      <div
        className={`bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col overflow-hidden ${closing ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight">Settings</h2>
          <div className="flex items-center gap-2">
            {s.saving && (
              <span className="text-[10px] text-zinc-600 animate-pulse">saving...</span>
            )}
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <TabBar tabs={visibleTabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="h-px bg-zinc-800/60 mx-5 mt-2.5" />

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          <TabContent activeTab={activeTab} s={s} loaded={s.loaded} />
        </div>

        <div className="h-px bg-zinc-800/60 mx-5" />
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-[10px] text-zinc-600">
            Changes are saved automatically
          </span>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-lg text-[12px] text-zinc-300 font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
