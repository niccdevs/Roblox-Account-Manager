import { useRef, useEffect } from "react";
import { useStore } from "../../store";
import { GroupSection } from "./GroupSection";

export function AccountList() {
  const store = useStore();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        store.navigateSelection(e.key === "ArrowUp" ? "up" : "down", e.shiftKey);
      }
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        store.selectAll();
      }
      if (e.key === "Escape") {
        store.deselectAll();
      }
      if (e.key === "Home") {
        e.preventDefault();
        if (store.orderedUserIds.length > 0) {
          store.selectSingle(store.orderedUserIds[0]);
        }
      }
      if (e.key === "End") {
        e.preventDefault();
        if (store.orderedUserIds.length > 0) {
          store.selectSingle(store.orderedUserIds[store.orderedUserIds.length - 1]);
        }
      }
    }

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [store.navigateSelection, store.selectAll, store.deselectAll, store.selectSingle, store.orderedUserIds]);

  function handleDrop(targetGroupKey: string) {
    if (!store.dragState) return;
    const userId = store.dragState.userId;
    const sourceGroup = store.dragState.sourceGroup;
    store.setDragState(null);
    if (sourceGroup === targetGroupKey) return;

    const selected = store.selectedIds.has(userId)
      ? [...store.selectedIds]
      : [userId];
    store.moveToGroup(selected, targetGroupKey);
  }

  function handleBackgroundClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      store.deselectAll();
    }
  }

  function handleBackgroundContext(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      e.preventDefault();
      store.deselectAll();
      store.openContextMenu(e.clientX, e.clientY);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function handleExternalDrop(e: React.DragEvent) {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain");
    if (!text) return;
    const cookieRe =
      /_\|WARNING:-DO-NOT-SHARE-THIS\.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items\.\|\w+/g;
    const matches = text.match(cookieRe);
    if (matches) {
      for (const cookie of matches) {
        await store.addAccountByCookie(cookie);
      }
    }
  }

  if (store.accounts.length === 0 && !store.searchQuery) {
    return (
      <div
        className="theme-surface flex-1 flex flex-col items-center justify-center min-h-0 text-center px-8"
        onDragOver={handleDragOver}
        onDrop={handleExternalDrop}
      >
        <div className="theme-panel theme-border w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 animate-fade-in">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="theme-muted">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </div>
        <p className="theme-muted text-sm mb-1 animate-fade-in">No accounts yet</p>
        <p className="theme-label text-xs animate-fade-in">
          Click <span className="theme-accent">Add</span> or drop a cookie here
        </p>
      </div>
    );
  }

  if (store.groups.length === 0 && store.searchQuery) {
    return (
      <div className="theme-surface flex-1 flex items-center justify-center min-h-0">
        <p className="theme-muted text-sm animate-fade-in">No matches for &ldquo;{store.searchQuery}&rdquo;</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      tabIndex={0}
      className="flex-1 overflow-y-auto min-h-0 py-1 outline-none"
      onClick={handleBackgroundClick}
      onContextMenu={handleBackgroundContext}
      onDragOver={handleDragOver}
      onDrop={handleExternalDrop}
    >
      {store.groups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          collapsed={store.collapsedGroups.has(group.key)}
          onToggle={() => store.toggleGroup(group.key)}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}
