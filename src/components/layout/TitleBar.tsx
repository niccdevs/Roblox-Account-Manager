import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useTr } from "../../i18n/text";

export function TitleBar() {
  const t = useTr();
  const [maximized, setMaximized] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    invoke<string>("get_setting", { section: "General", key: "MinimizeToTray" })
      .then((v) => setMinimizeToTray(v === "true"))
      .catch(() => {});
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleClose = useCallback(() => {
    if (minimizeToTray) {
      appWindow.hide();
    } else {
      appWindow.close();
    }
  }, [minimizeToTray]);

  return (
    <div className="theme-titlebar theme-border flex items-center h-9 shrink-0 select-none border-b">
      <div className="flex items-center gap-2.5 pl-3.5 pr-3 shrink-0">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-sm shadow-sky-500/20">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" stroke="white" strokeWidth="2.5" />
            <line x1="22" y1="11" x2="16" y2="11" stroke="white" strokeWidth="2.5" />
          </svg>
        </div>
        <span className="text-[12px] font-medium tracking-tight">
          {t("Roblox Account Manager")}
        </span>
      </div>

      <div
        className="flex-1 h-full"
        onMouseDown={() => appWindow.startDragging()}
      />

      <div className="flex items-center shrink-0">
        <button
          onClick={() => appWindow.minimize()}
          className="h-9 w-11 flex items-center justify-center theme-muted hover:text-[var(--panel-fg)] hover:bg-[var(--panel-soft)] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="6" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="h-9 w-11 flex items-center justify-center theme-muted hover:text-[var(--panel-fg)] hover:bg-[var(--panel-soft)] transition-colors"
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="3.5" width="7" height="7" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
              <path d="M3.5 3.5V2a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H8.5" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-9 w-11 flex items-center justify-center theme-muted hover:text-white hover:bg-red-600/80 transition-colors rounded-tr-none"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
