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
    <div className="w-72 border-l border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0 animate-slide-right">
      <div className="p-4 border-b border-zinc-800/60">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">
              {count} selected
            </div>
            <div className="text-[11px] text-zinc-600 mt-0.5">
              Ctrl+click to toggle, Shift+click for range
            </div>
          </div>
          <button
            onClick={store.deselectAll}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-0.5 rounded hover:bg-zinc-800"
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
            <div className="text-[11px] text-zinc-600 px-1 py-0.5">
              +{remaining} more
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <SidebarSection title="Launch">
          {store.launchProgress?.mode === "multi" && (
            <div className="mb-2 rounded-lg border border-sky-500/20 bg-sky-500/8 px-2.5 py-1.5 animate-fade-in">
              <div className="flex items-center gap-2 text-[11px] text-sky-300">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                <span className="font-medium">
                  Joining {store.launchProgress.current}/{store.launchProgress.total}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-zinc-600 w-10 shrink-0">Place</label>
              <input
                value={store.placeId}
                onChange={(e) => store.setPlaceId(e.target.value)}
                placeholder="Place ID"
                className="sidebar-input flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-zinc-600 w-10 shrink-0">Job</label>
              <input
                value={store.jobId}
                onChange={(e) => store.setJobId(e.target.value)}
                placeholder="Job ID"
                className="sidebar-input flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-zinc-600 w-10 shrink-0">Data</label>
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
            className="sidebar-btn bg-sky-600 hover:bg-sky-500 text-white mt-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {store.launchProgress?.mode === "multi" ? "Joining..." : `Join All (${count})`}
          </button>
        </SidebarSection>

        <SidebarSection title="Batch Actions">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleRefreshAll}
              disabled={refreshing}
              className="sidebar-btn bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 disabled:opacity-50"
            >
              {refreshing ? "Refreshing..." : `Refresh Cookies (${count})`}
            </button>
            <button onClick={handleCopyCookies} className="sidebar-btn bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60">
              Copy All Cookies
            </button>

            <div className="relative">
              <button
                onClick={() => setMoveOpen(!moveOpen)}
                className="sidebar-btn bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center justify-between"
              >
                <span>Move to Group</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {moveOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700/60 rounded-lg shadow-xl z-20 py-1 max-h-40 overflow-y-auto animate-scale-in">
                  {allGroups.map((g) => (
                    <button
                      key={g}
                      onClick={() => handleMoveToGroup(g)}
                      className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 truncate"
                    >
                      {parseGroupName(g).displayName}
                    </button>
                  ))}
                  <div className="h-px bg-zinc-800 my-1" />
                  <button
                    onClick={handleNewGroup}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-sky-400 hover:bg-zinc-800"
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
            className="sidebar-btn bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-500 border border-zinc-700/60"
          >
            Remove All ({count})
          </button>
        </SidebarSection>
      </div>
    </div>
  );
}
