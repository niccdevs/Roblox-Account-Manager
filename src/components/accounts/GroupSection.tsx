import { useStore } from "../../store";
import type { ParsedGroup } from "../../types";
import { AccountRow } from "./AccountRow";

export function GroupSection({
  group,
  collapsed,
  onToggle,
  onDrop,
}: {
  group: ParsedGroup;
  collapsed: boolean;
  onToggle: () => void;
  onDrop: (groupKey: string) => void;
}) {
  const store = useStore();
  const showHeader = group.key !== "__all__" && store.showGroups && (store.theme?.show_headers ?? true);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    onDrop(group.key);
  }

  const groupIds = group.accounts.map((a) => a.UserID);
  const allSelected = groupIds.length > 0 && groupIds.every((id) => store.selectedIds.has(id));
  const someSelected = groupIds.some((id) => store.selectedIds.has(id));
  const multiMode = store.selectedIds.size > 1;

  function handleGroupCheckbox(e: React.MouseEvent) {
    e.stopPropagation();
    if (allSelected) {
      const next = new Set(store.selectedIds);
      groupIds.forEach((id) => next.delete(id));
      store.setSelectedIds(next);
    } else {
      const next = new Set(store.selectedIds);
      groupIds.forEach((id) => next.add(id));
      store.setSelectedIds(next);
    }
  }

  return (
    <div className="mb-0.5">
      {showHeader && (
        <div
          className={`theme-group-header flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none text-xs transition-all duration-150 ${
            store.dragState ? "hover:bg-[var(--accent-soft)] hover:pl-4" : "hover:bg-[var(--row-hover)]"
          }`}
          onClick={onToggle}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className={`shrink-0 overflow-hidden transition-all duration-150 ease-out ${
            multiMode ? "w-3.5 opacity-100" : "w-0 opacity-0"
          }`}>
            <div
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all duration-100 cursor-pointer ${
                allSelected ? "" : someSelected ? "" : "theme-border group-hover:brightness-110"
              }`}
              style={
                allSelected
                  ? { backgroundColor: "var(--accent-color)", borderColor: "var(--accent-color)" }
                  : someSelected
                  ? { backgroundColor: "var(--accent-soft)", borderColor: "var(--accent-strong)" }
                  : undefined
              }
              onClick={handleGroupCheckbox}
            >
              {allSelected && (
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--forms-bg)"
                  strokeWidth="3.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {someSelected && !allSelected && (
                <div className="w-1.5 h-1.5 rounded-sm bg-[var(--accent-color)]" />
              )}
            </div>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`theme-muted transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
          >
            <path d="M8 5l8 7-8 7z" />
          </svg>
          <span className="theme-label font-medium">{group.displayName}</span>
          <span className="theme-muted text-[10px] tabular-nums">{group.accounts.length}</span>
        </div>
      )}

      <div
        className={`overflow-hidden transition-all duration-200 ${
          showHeader && collapsed ? "max-h-0 opacity-0" : "max-h-[9999px] opacity-100"
        }`}
        onDragOver={!showHeader ? handleDragOver : undefined}
        onDrop={!showHeader ? handleDrop : undefined}
      >
        {group.accounts.map((account) => (
          <AccountRow key={account.UserID} account={account} />
        ))}
      </div>
    </div>
  );
}
