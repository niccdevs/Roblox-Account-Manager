import { useStore } from "../../store";

export function StatusBar() {
  const store = useStore();
  const selected = store.selectedIds.size;
  const total = store.accounts.length;
  const filtered = store.searchQuery ? store.groups.reduce((n, g) => n + g.accounts.length, 0) : total;
  const showPresence = store.settings?.General?.ShowPresence === "true";
  const onlineCount = showPresence
    ? store.accounts.filter((a) => (store.presenceByUserId.get(a.UserID) ?? 0) >= 1).length
    : 0;
  const inGameCount = showPresence
    ? store.accounts.filter((a) => (store.presenceByUserId.get(a.UserID) ?? 0) >= 2).length
    : 0;
  const launchedCount = store.launchedByProgram.size;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-zinc-800/80 bg-zinc-950 text-[12px] text-zinc-500 shrink-0">
      <div className="flex items-center min-w-0 overflow-hidden pr-1">
        <div
          className={`overflow-hidden transition-[max-width,opacity,margin] duration-150 ease-out ${
            selected > 0 ? "max-w-[120px] opacity-100 mr-4" : "max-w-0 opacity-0 mr-0"
          }`}
        >
          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-sky-500/80" />
            <span className="text-sky-300">{selected}</span> selected
          </span>
        </div>

        <div
          className={`flex items-center gap-4 min-w-0 transition-transform duration-150 ease-out ${
            selected > 0 ? "translate-x-0.5" : "translate-x-0"
          }`}
        >
          <span className="shrink-0">
          {store.searchQuery ? (
            <>
              <span className="text-zinc-300">{filtered}</span> / {total} accounts
            </>
          ) : (
            <>
              <span className="text-zinc-300">{total}</span> account{total !== 1 ? "s" : ""}
            </>
          )}
          </span>
          {showPresence && (
            <span className="inline-flex items-center gap-3 shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500/80 animate-pulse" />
                <span className="text-sky-400/90">{onlineCount}</span> online
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse" />
                <span className="text-emerald-400/90">{inGameCount}</span> in game
              </span>
            </span>
          )}
          {launchedCount > 0 && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-500/90" />
              <span className="text-amber-300/90">{launchedCount}</span> launched
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-[12px] text-zinc-400">
        <span className="text-zinc-500 shrink-0 font-medium">Legend:</span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-1 ring-zinc-900" />
          invalid
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-1 ring-zinc-900" />
          aged
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-1 ring-zinc-900" />
          launched
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 ring-1 ring-zinc-900" />
          online
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1 ring-zinc-900" />
          in game
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-500 ring-1 ring-zinc-900" />
          studio
        </span>
      </div>
    </div>
  );
}
