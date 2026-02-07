import { useState } from "react";
import type { RecentGame } from "./types";
import { loadRecentGames, saveRecentGames } from "./types";

export interface RecentTabProps {
  onSelectGame: (placeId: number) => void;
  maxRecent: number;
}

export function RecentTab({
  onSelectGame,
  maxRecent,
}: RecentTabProps) {
  const [games, setGames] = useState<RecentGame[]>(loadRecentGames);

  function handleClear() {
    saveRecentGames([]);
    setGames([]);
  }

  function formatTime(ts: number) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-800 mb-3">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <p className="text-xs text-zinc-700">No recent games</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[10px] text-zinc-600">{games.length} of {maxRecent} max</span>
        <button
          onClick={handleClear}
          className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-1 px-1">
          {games.map((game) => (
            <div
              key={game.placeId}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/40 transition-colors cursor-pointer"
              onClick={() => onSelectGame(game.placeId)}
            >
              <div className="w-9 h-9 rounded-md bg-zinc-800 shrink-0 overflow-hidden">
                {game.iconUrl ? (
                  <img src={game.iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-700">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-zinc-200 truncate">{game.name}</div>
                <div className="text-[10px] text-zinc-600 font-mono">ID: {game.placeId}</div>
              </div>
              <span className="text-[10px] text-zinc-600 shrink-0">{formatTime(game.lastPlayed)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
