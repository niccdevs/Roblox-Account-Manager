import { useStore } from "../../store";
import type { Account } from "../../types";

function chipMaskName(name: string, previewLetters: number): string {
  if (previewLetters > 0 && previewLetters < name.length) {
    return name.slice(0, previewLetters) + "********";
  }
  return "************";
}

export function AccountChip({
  account,
  avatarUrl,
  onRemove,
}: {
  account: Account;
  avatarUrl?: string;
  onRemove: () => void;
}) {
  const store = useStore();
  const rawName = account.Alias || account.Username;
  const displayName = store.hideUsernames ? chipMaskName(rawName, store.hiddenNameLetters) : rawName;
  const hideAvatar = store.hideUsernames && !store.showAvatarsWhenHidden;
  const showPresence = store.settings?.General?.ShowPresence === "true";
  const presenceType = store.presenceByUserId.get(account.UserID) ?? 0;
  const isJoining = store.joiningAccounts.has(account.UserID);
  const presenceDot =
    presenceType === 3 ? "bg-violet-500" : presenceType >= 2 ? "bg-emerald-500" : presenceType === 1 ? "bg-sky-500" : "bg-zinc-600";

  return (
    <div className="flex items-center gap-2 px-1.5 py-1 rounded-md bg-zinc-900/60 border border-zinc-800/60 group/chip">
      {hideAvatar ? (
        <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600 shrink-0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        </div>
      ) : avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full bg-zinc-800 shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600 text-[9px] font-medium shrink-0">
          {(account.Username || "?").charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-[12px] text-zinc-300 truncate flex-1 min-w-0 inline-flex items-center gap-1.5">
        {showPresence && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${presenceDot} ${presenceType >= 1 ? "animate-pulse" : ""}`} />
        )}
        <span className="truncate">{displayName}</span>
      </span>
      {isJoining && (
        <span
          className="w-2.5 h-2.5 border border-sky-400 border-t-transparent rounded-full animate-spin shrink-0"
          title="Joining..."
        />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-zinc-700 hover:text-zinc-400 opacity-0 group-hover/chip:opacity-100 transition-opacity shrink-0"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
