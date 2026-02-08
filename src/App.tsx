import { useState, useEffect } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { StoreProvider, useStore } from "./store";
import { PromptProvider } from "./hooks/usePrompt";
import { PasswordScreen } from "./components/layout/PasswordScreen";
import { TitleBar } from "./components/layout/TitleBar";
import { UpdateBanner } from "./components/layout/UpdateBanner";
import { Toolbar } from "./components/layout/Toolbar";
import { AccountList } from "./components/accounts/AccountList";
import { ContextMenu } from "./components/menus/ContextMenu";
import { DetailSidebar } from "./components/accounts/DetailSidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { ServerListDialog } from "./components/server-list/ServerListDialog";
import { ImportDialog } from "./components/dialogs/ImportDialog";
import { AccountFieldsDialog } from "./components/dialogs/AccountFieldsDialog";
import { AccountUtilsDialog } from "./components/dialogs/AccountUtilsDialog";
import { MissingAssetsDialog } from "./components/dialogs/MissingAssetsDialog";
import { ThemeEditorDialog } from "./components/dialogs/ThemeEditorDialog";
import { NexusDialog } from "./components/dialogs/NexusDialog";

function AppContent() {
  const store = useStore();
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    if (!store.initialized || store.needsPassword) return;
    if (store.settings?.General?.CheckForUpdates === "false") return;
    check().then((u) => { if (u?.available) setUpdate(u); }).catch(() => {});
  }, [store.initialized, store.needsPassword]);

  if (!store.initialized) {
    return (
      <div className="theme-app flex h-screen items-center justify-center">
        <div className="text-sm theme-muted">Loading...</div>
      </div>
    );
  }

  if (store.needsPassword) {
    return <PasswordScreen />;
  }

  return (
    <div className="theme-app flex h-screen flex-col">
      <TitleBar />
      {update && <UpdateBanner update={update} />}
      <Toolbar />

      {store.error && (
        <div className="mx-4 mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-400 flex items-center justify-between animate-fade-in">
          <span className="truncate">{store.error}</span>
          <button
            onClick={() => store.setError(null)}
            className="ml-2 text-red-500/60 hover:text-red-400 shrink-0 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <AccountList />
        {store.sidebarOpen && <DetailSidebar />}
      </div>

      <StatusBar />

      <ContextMenu />

      {store.toasts.length > 0 && (
        <div className="fixed bottom-10 right-4 z-[60] flex flex-col gap-1.5">
          {store.toasts.map((msg, i) => (
            <div
              key={i}
              className="theme-panel theme-border backdrop-blur-lg px-4 py-2 rounded-lg text-xs shadow-xl animate-toast"
            >
              {msg}
            </div>
          ))}
        </div>
      )}

      <SettingsDialog
        open={store.settingsOpen}
        onClose={() => store.setSettingsOpen(false)}
        onSettingsChanged={store.reloadSettings}
      />

      <ServerListDialog
        open={store.serverListOpen}
        onClose={() => store.setServerListOpen(false)}
      />

      <ImportDialog
        open={store.importDialogOpen}
        onClose={() => store.setImportDialogOpen(false)}
        defaultTab={store.importDialogTab}
      />

      <AccountFieldsDialog
        open={store.accountFieldsOpen}
        onClose={() => store.setAccountFieldsOpen(false)}
      />

      <AccountUtilsDialog
        open={store.accountUtilsOpen}
        onClose={() => store.setAccountUtilsOpen(false)}
      />

      <MissingAssetsDialog />

      <ThemeEditorDialog
        open={store.themeEditorOpen}
        onClose={() => store.setThemeEditorOpen(false)}
      />

      <NexusDialog
        open={store.nexusOpen}
        onClose={() => store.setNexusOpen(false)}
      />

      {store.modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={store.closeModal}
        >
          <div
            className="theme-panel theme-border rounded-xl p-5 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--panel-fg)]">{store.modal.title}</h3>
              <button
                onClick={store.closeModal}
                className="theme-muted hover:opacity-100 transition-opacity"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="theme-input text-xs font-mono rounded-lg p-4 overflow-auto flex-1">
              {store.modal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <StoreProvider>
      <PromptProvider>
        <AppContent />
      </PromptProvider>
    </StoreProvider>
  );
}

export default App;
