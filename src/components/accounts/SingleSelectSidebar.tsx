import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { useConfirm, usePrompt } from "../../hooks/usePrompt";
import { useJoinOnlineWarning } from "../../hooks/useJoinOnlineWarning";
import { SidebarSection } from "./SidebarSection";
import { ArgumentsForm } from "../dialogs/ArgumentsForm";
import { Tooltip } from "../ui/Tooltip";
import { loadRecentGames, type RecentGame } from "../server-list/types";
import { tr, useTr } from "../../i18n/text";

function chipMaskName(name: string, previewLetters: number): string {
  if (previewLetters > 0 && previewLetters < name.length) {
    return name.slice(0, previewLetters) + "********";
  }
  return "************";
}

export function SingleSelectSidebar() {
  const t = useTr();
  const store = useStore();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const confirmJoinOnline = useJoinOnlineWarning();
  const account = store.selectedAccount!;
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState("");
  const [robux, setRobux] = useState<number | null>(null);
  const [followUser, setFollowUser] = useState("");
  const [argsOpen, setArgsOpen] = useState(false);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const argsRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setAlias(account.Alias);
    setDescription(account.Description);
    setRobux(null);

    invoke<number>("get_robux", { userId: account.UserID })
      .then(setRobux)
      .catch(() => {});

    const savedPlace = account.Fields?.SavedPlaceId;
    const savedJob = account.Fields?.SavedJobId;
    const savedData = account.Fields?.SavedLaunchData;
    if (savedPlace) store.setPlaceId(savedPlace);
    if (savedJob) store.setJobId(savedJob);
    if (savedData) store.setLaunchData(savedData);
    setRecentGames(loadRecentGames().slice(0, 12));
  }, [account.UserID]);

  function handleSetAlias() {
    store.updateAccount({ ...account, Alias: alias.slice(0, 30) });
    store.addToast(tr("Alias updated"));
  }

  function handleSetDescription() {
    store.updateAccount({ ...account, Description: description });
    store.addToast(tr("Description updated"));
  }

  async function handleSavePlace() {
    const fields = { ...account.Fields, SavedPlaceId: store.placeId, SavedJobId: store.jobId, SavedLaunchData: store.launchData };
    store.updateAccount({ ...account, Fields: fields });
    store.addToast(tr("Place saved to account"));
  }

  async function handleJoin() {
    if (!(await confirmJoinOnline([account.UserID]))) return;
    await store.joinServer(account.UserID);
  }

  async function handleFollow() {
    if (!followUser.trim()) return;
    try {
      const user = await invoke<{ id: number }>("lookup_user", { username: followUser.trim() });
      const presence = await invoke<{ userPresenceType?: number; user_presence_type?: number }[]>("get_presence", {
        userIds: [user.id],
      });
      const followPresenceType = presence[0]?.userPresenceType ?? presence[0]?.user_presence_type ?? 0;
      if (followPresenceType < 2) {
        if (!(await confirm(tr("{{name}} is not in a game. Try anyway?", { name: followUser })))) return;
      }
      await invoke("launch_roblox", {
        userId: account.UserID,
        placeId: user.id,
        jobId: "",
        launchData: "",
        followUser: true,
        joinVip: false,
        linkCode: "",
        shuffleJob: false,
      });
      store.addToast(tr("Following {{name}}...", { name: followUser }));
    } catch (e) {
      store.addToast(tr("Follow failed: {{error}}", { error: String(e) }));
    }
  }

  async function handleJoinGroup() {
    const input = await prompt(tr("Group ID:"));
    if (!input) return;
    const groupId = parseInt(input.trim(), 10);
    if (!Number.isFinite(groupId) || groupId <= 0) {
      store.addToast(tr("Invalid group ID"));
      return;
    }
    try {
      await invoke("join_group", { userId: account.UserID, groupId });
      store.addToast(tr("Joined group {{groupId}}", { groupId }));
    } catch (e) {
      store.addToast(tr("Join group failed: {{error}}", { error: String(e) }));
    }
  }

  const avatarUrl = store.avatarUrls.get(account.UserID);
  const rawName = account.Alias || account.Username;
  const displayName = store.hideUsernames ? chipMaskName(rawName, store.hiddenNameLetters) : rawName;
  const hideAvatar = store.hideUsernames && !store.showAvatarsWhenHidden;
  const presenceType = store.presenceByUserId.get(account.UserID) ?? 0;
  const isJoining = store.joiningAccounts.has(account.UserID);
  const presenceMeta =
    presenceType === 3
      ? { label: t("In Studio"), dot: "bg-violet-500", dotStyle: undefined as React.CSSProperties | undefined, text: "text-violet-400" }
      : presenceType >= 2
      ? { label: t("In Game"), dot: "bg-emerald-500", dotStyle: undefined as React.CSSProperties | undefined, text: "text-emerald-400" }
      : presenceType === 1
        ? { label: t("Online"), dot: "bg-sky-500", dotStyle: undefined as React.CSSProperties | undefined, text: "text-sky-400" }
        : { label: t("Offline"), dot: "", dotStyle: { backgroundColor: "var(--panel-muted)" }, text: "theme-muted" };

  return (
    <div className="theme-surface theme-border w-72 border-l flex flex-col shrink-0 animate-slide-right">
      <div className="p-4 border-b theme-border">
        <div className="flex items-center gap-3">
          {hideAvatar ? (
            <div className="theme-avatar w-12 h-12 rounded-full bg-[var(--panel-soft)] flex items-center justify-center theme-muted">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
          ) : avatarUrl ? (
            <img src={avatarUrl} alt="" className="theme-avatar w-12 h-12 rounded-full bg-[var(--panel-soft)]" />
          ) : (
            <div className="theme-avatar w-12 h-12 rounded-full bg-[var(--panel-soft)] flex items-center justify-center theme-muted text-lg font-medium">
              {(account.Username || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm font-medium text-[var(--panel-fg)] truncate">
                {displayName}
              </div>
              {store.settings?.General?.ShowPresence === "true" && (
                <div className={`inline-flex items-center gap-1 text-[10px] ${presenceMeta.text}`}>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${presenceMeta.dot} ${presenceType >= 1 ? "animate-pulse" : ""}`}
                    style={presenceMeta.dotStyle}
                  />
                  <span>{presenceMeta.label}</span>
                </div>
              )}
            </div>
            {account.Alias && !store.hideUsernames && (
              <div className="text-xs theme-muted truncate">@{account.Username}</div>
            )}
            <div className="text-[11px] theme-muted font-mono">
              {store.hideUsernames ? t("ID: ********") : t("ID: {{id}}", { id: account.UserID })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs">
          {robux !== null && (
            <div className="flex items-center gap-1 theme-muted">
              <span className="text-amber-500">R$</span>
              <span className="font-mono">
                {store.hideUsernames && store.hideRobuxWhenHidden ? "****" : robux.toLocaleString()}
              </span>
            </div>
          )}
          <div className={`${account.Valid ? "text-emerald-500" : "text-red-400"}`}>
            {account.Valid ? t("Valid") : t("Invalid")}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <SidebarSection title={t("Alias")}>
          <div className="flex gap-1.5">
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={30}
              placeholder={t("Alias")}
              className="sidebar-input flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleSetAlias()}
            />
            <button onClick={handleSetAlias} className="sidebar-btn-sm">
              {t("Set")}
            </button>
          </div>
        </SidebarSection>

        <SidebarSection title={t("Description")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Description")}
            className="sidebar-input min-h-[60px] resize-none"
            rows={3}
          />
          <button onClick={handleSetDescription} className="sidebar-btn-sm mt-1.5 self-end">
            {t("Set Description")}
          </button>
        </SidebarSection>

        <SidebarSection title={t("Launch")}>
          {recentGames.length > 0 && (
            <div className="mb-1.5">
              <select
                value=""
                onChange={(e) => {
                  const selected = recentGames.find((g) => String(g.placeId) === e.target.value);
                  if (!selected) return;
                  store.setPlaceId(String(selected.placeId));
                }}
                className="sidebar-input w-full text-xs"
              >
                <option value="">{t("Recent games...")}</option>
                {recentGames.map((g) => (
                  <option key={g.placeId} value={g.placeId}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <label className="theme-label text-[10px] w-10 shrink-0">{t("Place")}</label>
              <input
                value={store.placeId}
                onChange={(e) => store.setPlaceId(e.target.value)}
                placeholder={t("Place ID")}
                className="sidebar-input flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="theme-label text-[10px] w-10 shrink-0">{t("Job")}</label>
              <input
                value={store.jobId}
                onChange={(e) => store.setJobId(e.target.value)}
                placeholder={t("Job ID")}
                className="sidebar-input flex-1 font-mono text-xs"
              />
              <Tooltip content={t("Shuffle Job ID")}>
                <button
                  onClick={() => store.setShuffleJobId(!store.shuffleJobId)}
                  className={`p-1 rounded text-xs ${
                    store.shuffleJobId
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "theme-muted hover:text-[var(--panel-fg)]"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                </button>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="theme-label text-[10px] w-10 shrink-0">{t("Data")}</label>
              <input
                value={store.launchData}
                onChange={(e) => store.setLaunchData(e.target.value)}
                placeholder={t("Launch Data")}
                className="sidebar-input flex-1 text-xs"
              />
              <Tooltip content={t("Save to account")}>
                <button
                  onClick={handleSavePlace}
                  className="theme-muted p-1 rounded hover:text-[var(--panel-fg)]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 relative">
            <button
              onClick={handleJoin}
              disabled={isJoining}
              className="sidebar-btn theme-btn flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isJoining ? t("Joining...") : t("Join Server")}
            </button>
            <Tooltip content={t("Launch Arguments")}>
              <button
                ref={argsRef}
                onClick={() => setArgsOpen(!argsOpen)}
                className="theme-btn-ghost p-1.5 rounded-lg transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </Tooltip>
            <ArgumentsForm open={argsOpen} onClose={() => setArgsOpen(false)} anchorRef={argsRef} />
          </div>
          {isJoining && (
            <div className="theme-accent mt-1.5 inline-flex items-center gap-2 text-[11px] animate-fade-in">
              <span className="w-2.5 h-2.5 border border-[var(--accent-color)] border-t-transparent rounded-full animate-spin" />
              <span>{t("Preparing Roblox launch for this account...")}</span>
            </div>
          )}
        </SidebarSection>

        <SidebarSection title={t("Follow")}>
          <div className="flex gap-1.5">
            <input
              value={followUser}
              onChange={(e) => setFollowUser(e.target.value)}
              placeholder={t("Username")}
              className="sidebar-input flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleFollow()}
            />
            <button onClick={handleFollow} className="sidebar-btn-sm">
              {t("Follow")}
            </button>
          </div>
        </SidebarSection>

        <SidebarSection title={t("Tools")}>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => store.setServerListOpen(true)}
              className="sidebar-btn-tool"
            >
              {t("Server List")}
            </button>
            <button
              onClick={() => store.setAccountUtilsOpen(true)}
              className="sidebar-btn-tool"
            >
              {t("Utilities")}
            </button>
            <button
              onClick={() => store.openAccountBrowser(account.UserID)}
              className="sidebar-btn-tool"
            >
              {t("Browser")}
            </button>
            <button
              onClick={handleJoinGroup}
              className="sidebar-btn-tool"
            >
              {t("Join Group")}
            </button>
            {/* Removed: "Refresh" was unreliable and duplicated the explicit Sign Out action in Utilities. */}
          </div>
        </SidebarSection>
      </div>
    </div>
  );
}
