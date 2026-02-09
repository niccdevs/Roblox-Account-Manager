import { useState, useMemo } from "react";
import { useStore } from "../../store";
import { usePrompt, useConfirm } from "../../hooks/usePrompt";
import { useJoinOnlineWarning } from "../../hooks/useJoinOnlineWarning";
import { parseGroupName } from "../../types";
import { SidebarSection } from "./SidebarSection";
import { AccountChip } from "./AccountChip";

export function MultiSelectSidebar() {
  const store = useStore();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const confirmJoinOnline = useJoinOnlineWarning();
  const accounts = store.selectedAccounts;
  const count = accounts.length;
  const [refreshing, setRefreshing] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const previewAccounts = accounts.slice(0, 5);
  const remaining = count - previewAccounts.length;
  const bottingEnabled = store.settings?.General?.BottingEnabled === "true";
  const showBottingButton = bottingEnabled || store.bottingStatus?.active === true;
  const errorLower = (store.error || "").toLowerCase();
  const pulseCloseAction =
    errorLower.includes("failed to enable multi roblox") ||
    (errorLower.includes("multi roblox") && errorLower.includes("close all roblox process"));

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    store.accounts.forEach((a) => set.add(a.Group || "Default"));
    return [...set].sort();
  }, [store.accounts]);

  async function handleJoin() {
    const ids = accounts.map((a) => a.UserID);
    if (!(await confirmJoinOnline(ids))) return;
    try {
      await store.launchMultiple(ids);
    } catch (e) {
      store.addToast(`Launch failed: ${e}`);
    }
  }

  async function handleRefreshAll() {
    setRefreshing(true);
    let ok = 0;
    let fail = 0;
    for (const a of accounts) {
      const result = await store.refreshCookie(a.UserID);
      if (result) ok++;
      else fail++;
      await new Promise((r) => setTimeout(r, 2000));
    }
    setRefreshing(false);
    store.addToast(`Refreshed: ${ok} ok, ${fail} failed`);
  }

  async function handleCopyCookies() {
    const cookies = accounts.map((a) => a.SecurityToken).filter(Boolean);
    await navigator.clipboard.writeText(cookies.join("\n"));
    store.addToast(`Copied ${cookies.length} cookies`);
  }

  async function handleMoveToGroup(group: string) {
    setMoveOpen(false);
    await store.moveToGroup(
      accounts.map((a) => a.UserID),
      group
    );
  }

  async function handleNewGroup() {
    setMoveOpen(false);
    const name = await prompt("New group name:");
    if (!name?.trim()) return;
    await store.moveToGroup(
      accounts.map((a) => a.UserID),
      name.trim()
    );
  }

  return (
    <div className="theme-surface theme-border w-72 border-l flex flex-col shrink-0 animate-slide-right">
      <div className="p-4 border-b theme-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[var(--panel-fg)]">
              {count} selected
            </div>
            <div className="theme-muted text-[11px] mt-0.5">
              Ctrl+click to toggle, Shift+click for range
            </div>
          </div>
          <button
            onClick={store.deselectAll}
            className="theme-btn-ghost text-[11px] transition-colors px-2 py-0.5 rounded"
          >
            Clear
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          {previewAccounts.map((a) => (
            <AccountChip
              key={a.UserID}
              account={a}
              avatarUrl={store.avatarUrls.get(a.UserID)}
              onRemove={() => {
                store.handleSelect(a.UserID, { ctrlKey: true, shiftKey: false, metaKey: false } as unknown as React.MouseEvent);
              }}
            />
          ))}
          {remaining > 0 && (
            <div className="theme-muted text-[11px] px-1 py-0.5">
              +{remaining} more
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <SidebarSection title="Launch">
          {store.launchProgress?.mode === "multi" && (
            <div className="theme-accent-bg theme-accent-border mb-2 rounded-lg border px-2.5 py-1.5 animate-fade-in">
              <div className="theme-accent flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-color)] animate-pulse" />
                <span className="font-medium">
                  Joining {store.launchProgress.current}/{store.launchProgress.total}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <label className="theme-label text-[10px] w-10 shrink-0">Place</label>
              <input
                value={store.placeId}
                onChange={(e) => store.setPlaceId(e.target.value)}
                placeholder="Place ID"
                className="sidebar-input flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="theme-label text-[10px] w-10 shrink-0">Job</label>
              <input
                value={store.jobId}
                onChange={(e) => store.setJobId(e.target.value)}
                placeholder="Job ID"
                className="sidebar-input flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="theme-label text-[10px] w-10 shrink-0">Data</label>
              <input
                value={store.launchData}
                onChange={(e) => store.setLaunchData(e.target.value)}
                placeholder="Launch Data"
                className="sidebar-input flex-1 text-xs"
              />
            </div>
          </div>
          <button
            onClick={handleJoin}
            disabled={store.launchProgress?.mode === "multi"}
            className="sidebar-btn theme-btn mt-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {store.launchProgress?.mode === "multi" ? "Joining..." : `Join All (${count})`}
          </button>
          {showBottingButton && (
            <button
              onClick={() => store.setBottingDialogOpen(true)}
              className="sidebar-btn theme-btn mt-1.5 bg-[var(--buttons-bg)]/80 border-[var(--buttons-bc)] animate-fade-in"
            >
              Open Botting Mode
            </button>
          )}
          <button
            onClick={() => store.killAllRobloxProcesses()}
            className={`sidebar-btn theme-btn mt-1.5 text-amber-200 hover:bg-amber-500/15 ${
              pulseCloseAction ? "animate-pulse" : ""
            }`}
          >
            Close All Roblox
          </button>
        </SidebarSection>

        <SidebarSection title="Batch Actions">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleRefreshAll}
              disabled={refreshing}
              className="sidebar-btn theme-btn disabled:opacity-50"
            >
              {refreshing ? "Refreshing..." : `Refresh Cookies (${count})`}
            </button>
            <button onClick={handleCopyCookies} className="sidebar-btn theme-btn">
              Copy All Cookies
            </button>

            <div className="relative">
              <button
                onClick={() => setMoveOpen(!moveOpen)}
                className="sidebar-btn theme-btn flex items-center justify-between"
              >
                <span>Move to Group</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="theme-muted">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {moveOpen && (
                <div className="theme-panel theme-border absolute left-0 right-0 top-full mt-1 border rounded-lg shadow-xl z-20 py-1 max-h-40 overflow-y-auto animate-scale-in">
                  {allGroups.map((g) => (
                    <button
                      key={g}
                      onClick={() => handleMoveToGroup(g)}
                      className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--panel-fg)] hover:bg-[var(--panel-soft)] truncate"
                    >
                      {parseGroupName(g).displayName}
                    </button>
                  ))}
                  <div className="theme-border h-px border-t my-1" />
                  <button
                    onClick={handleNewGroup}
                    className="theme-accent w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--panel-soft)]"
                  >
                    + New Group...
                  </button>
                </div>
              )}
            </div>
          </div>
        </SidebarSection>

        <SidebarSection title="Danger Zone">
          <button
            onClick={async () => {
              if (await confirm(`Remove ${count} accounts?`, true)) {
                store.removeAccounts(accounts.map((a) => a.UserID));
              }
            }}
            className="sidebar-btn theme-btn text-red-300/80 hover:bg-red-500/15 hover:text-red-300"
          >
            Remove All ({count})
          </button>
        </SidebarSection>
      </div>
    </div>
  );
}
