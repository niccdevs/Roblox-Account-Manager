import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { usePrompt } from "../../hooks/usePrompt";

export function Toolbar() {
  const store = useStore();
  const prompt = usePrompt();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const activeToggleStyle = "theme-accent theme-accent-bg theme-accent-border";

  useEffect(() => {
    if (!addMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addMenuOpen]);

  function handleBrowserLogin() {
    setAddMenuOpen(false);
    store.openLoginBrowser();
  }

  function handleImportCookie() {
    setAddMenuOpen(false);
    store.setImportDialogTab("cookie");
    store.setImportDialogOpen(true);
  }

  function handleImportOldAccountData() {
    setAddMenuOpen(false);
    store.setImportDialogTab("legacy");
    store.setImportDialogOpen(true);
  }

  async function handleQuickAdd() {
    setAddMenuOpen(false);
    const input = await prompt("Cookie or username");
    if (!input?.trim()) return;
    const value = input.trim();

    try {
      if (value.includes("_|WARNING:-DO-NOT-SHARE")) {
        await store.addAccountByCookie(value);
        return;
      }

      const user = await invoke<{ id: number; name: string }>("lookup_user", { username: value });
      await invoke("add_account", {
        securityToken: "",
        username: user.name,
        userId: user.id,
      });
      await store.loadAccounts();
      store.addToast(`Added ${user.name}`);
    } catch (e) {
      store.addToast(`Add failed: ${e}`);
    }
  }

  return (
    <div className="theme-panel theme-border flex items-center gap-3 px-4 py-2 border-b shrink-0">
      <div className="relative flex-1 max-w-xs">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="absolute left-3 top-1/2 -translate-y-1/2 theme-muted"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={store.searchQuery}
          onChange={(e) => store.setSearchQuery(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Filter accounts..."
          autoComplete="off"
          spellCheck={false}
          className="theme-input w-full pl-9 pr-3 py-1.5 rounded-lg text-sm transition-colors"
        />
        {store.searchQuery && (
          <button
            onClick={() => store.setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 theme-muted hover:opacity-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={() => store.toggleSelectAll()}
          className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            store.selectedIds.size > 0
              ? activeToggleStyle
              : "theme-btn-ghost"
          }`}
          title={store.selectedIds.size > 0 ? `Deselect all (${store.selectedIds.size})` : "Select all"}
        >
          {store.selectedIds.size > 0 ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="m9 9 6 6M15 9l-6 6" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          )}
        </button>

        <button
          onClick={() => store.setHideUsernames(!store.hideUsernames)}
          className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            store.hideUsernames
              ? activeToggleStyle
              : "theme-btn-ghost"
          }`}
        >
          {store.hideUsernames ? "Hidden" : "Names"}
        </button>

        <button
          onClick={() => store.setSidebarOpen(!store.sidebarOpen)}
          className={`p-1.5 rounded-lg border transition-colors ${
            store.sidebarOpen
              ? activeToggleStyle
              : "theme-btn-ghost"
          }`}
          title={store.sidebarOpen ? "Hide panel" : "Show panel"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>

        <div className="w-px h-5 mx-1 bg-[var(--border-color)]" />

        <div ref={addRef} className="relative">
          <button
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="theme-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {addMenuOpen && (
            <div className="theme-panel theme-border absolute right-0 top-full mt-1.5 w-52 border rounded-xl shadow-2xl z-50 animate-scale-in py-1">
              <button
                onClick={handleQuickAdd}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-[var(--panel-fg)] hover:bg-[var(--panel-soft)] text-left"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="theme-muted">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Quick Add
              </button>
              <button
                onClick={handleBrowserLogin}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-[var(--panel-fg)] hover:bg-[var(--panel-soft)] text-left"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="theme-muted">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Browser Login
              </button>
              <div className="mx-3 my-0.5 border-t theme-border" />
              <button
                onClick={handleImportCookie}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-[var(--panel-fg)] hover:bg-[var(--panel-soft)] text-left"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="theme-muted">
                  <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v16.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h10.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V7.5L15.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Import Cookie
              </button>
              <button
                onClick={handleImportOldAccountData}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-[var(--panel-fg)] hover:bg-[var(--panel-soft)] text-left"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="theme-muted">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M9 15h6" />
                </svg>
                Import Old Account Data
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => store.setSettingsOpen(true)}
          className="theme-btn-ghost p-1.5 rounded-lg transition-colors"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
