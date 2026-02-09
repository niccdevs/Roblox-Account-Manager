import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Account, ThemeData, ThumbnailData, ParsedGroup } from "./types";
import { parseGroupName } from "./types";
import { applyThemeCssVariables, normalizeTheme } from "./theme";

interface PresenceEntry {
  userId?: number;
  userPresenceType?: number;
  user_id?: number;
  user_presence_type?: number;
}

interface RunningInstanceEntry {
  userId?: number;
  user_id?: number;
  pid?: number;
}

interface LaunchProgressState {
  mode: "single" | "multi";
  current: number;
  total: number;
  userId: number | null;
}

type ActionStatusTone = "info" | "success" | "warn" | "error";

interface ActionStatusState {
  message: string;
  tone: ActionStatusTone;
  at: number;
}

export interface StoreValue {
  accounts: Account[];
  groups: ParsedGroup[];
  loadAccounts: () => Promise<void>;
  saveAccounts: () => Promise<void>;
  addAccountByCookie: (cookie: string) => Promise<void>;
  removeAccounts: (userIds: number[]) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;

  selectedIds: Set<number>;
  selectedAccount: Account | null;
  selectedAccounts: Account[];
  handleSelect: (userId: number, e: React.MouseEvent) => void;
  selectSingle: (userId: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelectAll: () => void;
  setSelectedIds: (ids: Set<number>) => void;
  navigateSelection: (direction: "up" | "down", shift: boolean) => void;
  orderedUserIds: number[];

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showGroups: boolean;
  setShowGroups: (show: boolean) => void;
  collapsedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  hideUsernames: boolean;
  setHideUsernames: (hide: boolean) => void;
  hiddenNameLetters: number;
  showAvatarsWhenHidden: boolean;
  hideRobuxWhenHidden: boolean;

  placeId: string;
  setPlaceId: (id: string) => void;
  jobId: string;
  setJobId: (id: string) => void;
  launchData: string;
  setLaunchData: (data: string) => void;
  shuffleJobId: boolean;
  setShuffleJobId: (shuffle: boolean) => void;

  contextMenu: { x: number; y: number } | null;
  openContextMenu: (x: number, y: number) => void;
  closeContextMenu: () => void;

  settings: Record<string, Record<string, string>> | null;
  theme: ThemeData | null;
  applyThemePreview: (theme: ThemeData) => void;
  saveTheme: (theme: ThemeData) => Promise<void>;
  devMode: boolean;

  avatarUrls: Map<number, string>;
  presenceByUserId: Map<number, number>;
  launchedByProgram: Set<number>;

  joinServer: (userId: number) => Promise<void>;
  launchMultiple: (userIds: number[]) => Promise<void>;
  killAllRobloxProcesses: () => Promise<void>;
  refreshCookie: (userId: number) => Promise<boolean>;
  moveToGroup: (userIds: number[], group: string) => Promise<void>;
  sortGroupAlphabetically: (groupKey: string) => void;
  reorderAccounts: (draggedUserId: number, targetUserId: number) => Promise<void>;
  joiningAccounts: Set<number>;
  launchProgress: LaunchProgressState | null;

  dragState: { userId: number; sourceGroup: string } | null;
  setDragState: (s: { userId: number; sourceGroup: string } | null) => void;

  toasts: string[];
  addToast: (msg: string) => void;
  actionStatus: ActionStatusState | null;
  modal: { title: string; content: string } | null;
  showModal: (title: string, content: string) => void;
  closeModal: () => void;

  error: string | null;
  setError: (e: string | null) => void;
  needsPassword: boolean;
  unlocking: boolean;
  unlock: (password: string) => Promise<void>;
  initialized: boolean;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  reloadSettings: () => Promise<void>;

  serverListOpen: boolean;
  setServerListOpen: (open: boolean) => void;

  accountUtilsOpen: boolean;
  setAccountUtilsOpen: (open: boolean) => void;
  accountFieldsOpen: boolean;
  setAccountFieldsOpen: (open: boolean) => void;
  importDialogOpen: boolean;
  setImportDialogOpen: (open: boolean) => void;
  importDialogTab: "cookie" | "legacy";
  setImportDialogTab: (tab: "cookie" | "legacy") => void;
  themeEditorOpen: boolean;
  setThemeEditorOpen: (open: boolean) => void;
  missingAssets: { userId: number; username: string; assetIds: number[] } | null;
  setMissingAssets: (v: { userId: number; username: string; assetIds: number[] } | null) => void;

  nexusOpen: boolean;
  setNexusOpen: (open: boolean) => void;

  openLoginBrowser: () => Promise<void>;
  openAccountBrowser: (userId: number) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore requires StoreProvider");
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGroups, setShowGroups] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [placeId, _setPlaceId] = useState("");
  const [jobId, _setJobId] = useState("");
  const [launchData, _setLaunchData] = useState("");

  const setPlaceId = useCallback((v: string) => {
    _setPlaceId(v);
    invoke("update_setting", { section: "General", key: "SavedPlaceId", value: v }).catch(() => {});
  }, []);
  const setJobId = useCallback((v: string) => {
    _setJobId(v);
    invoke("update_setting", { section: "General", key: "SavedJobId", value: v }).catch(() => {});
  }, []);
  const setLaunchData = useCallback((v: string) => {
    _setLaunchData(v);
    invoke("update_setting", { section: "General", key: "SavedLaunchData", value: v }).catch(() => {});
  }, []);
  const [hideUsernamesState, setHideUsernamesState] = useState(false);
  const hideUsernames = hideUsernamesState;
  const setHideUsernames = useCallback((hide: boolean) => {
    setHideUsernamesState(hide);
    invoke("update_setting", {
      section: "General",
      key: "HideUsernames",
      value: hide ? "true" : "false",
    }).catch(() => {});
  }, []);
  const [shuffleJobId, setShuffleJobId] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<Record<string, Record<string, string>> | null>(null);
  const [theme, setThemeState] = useState<ThemeData | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Map<number, string>>(new Map());
  const [presenceByUserId, setPresenceByUserId] = useState<Map<number, number>>(new Map());
  const [launchedByProgram, setLaunchedByProgram] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [dragState, setDragState] = useState<{ userId: number; sourceGroup: string } | null>(null);
  const [toasts, setToasts] = useState<string[]>([]);
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverListOpen, setServerListOpen] = useState(false);
  const [accountUtilsOpen, setAccountUtilsOpen] = useState(false);
  const [accountFieldsOpen, setAccountFieldsOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDialogTab, setImportDialogTab] = useState<"cookie" | "legacy">("cookie");
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [missingAssets, setMissingAssets] = useState<{ userId: number; username: string; assetIds: number[] } | null>(null);
  const [nexusOpen, setNexusOpen] = useState(false);
  const [joiningAccounts, setJoiningAccounts] = useState<Set<number>>(new Set());
  const [launchProgress, setLaunchProgress] = useState<LaunchProgressState | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatusState | null>(null);

  const avatarLoadingRef = useRef<Set<number>>(new Set());
  const launchClearTimeoutRef = useRef<number | null>(null);
  const actionStatusTimeoutRef = useRef<number | null>(null);

  const devMode = settings?.Developer?.DevMode === "true";
  const hiddenNameLetters = parseInt(settings?.General?.HiddenNameLetters || "0") || 0;
  const showAvatarsWhenHidden = settings?.General?.ShowAvatarsWhenHidden === "true";
  const hideRobuxWhenHidden = settings?.General?.HideRobuxWhenHidden === "true";

  const filteredAccounts = useMemo(() => {
    if (!searchQuery) return accounts;
    const q = searchQuery.toLowerCase();
    return accounts.filter(
      (a) =>
        (a.Username || "").toLowerCase().includes(q) ||
        (a.Alias || "").toLowerCase().includes(q) ||
        (a.Description || "").toLowerCase().includes(q) ||
        (a.Group || "").toLowerCase().includes(q)
    );
  }, [accounts, searchQuery]);

  const groups = useMemo(() => {
    if (!showGroups) {
      return [
        {
          key: "__all__",
          displayName: "Accounts",
          sortKey: 0,
          accounts: filteredAccounts,
        },
      ];
    }

    const groupMap = new Map<string, Account[]>();
    for (const account of filteredAccounts) {
      const group = account.Group || "Default";
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(account);
    }
    const parsed: ParsedGroup[] = [];
    for (const [key, accts] of groupMap) {
      const { sortKey, displayName } = parseGroupName(key);
      parsed.push({ key, displayName, sortKey, accounts: accts });
    }
    parsed.sort((a, b) => a.sortKey - b.sortKey || a.displayName.localeCompare(b.displayName));
    return parsed;
  }, [filteredAccounts, showGroups]);

  const orderedUserIds = useMemo(() => {
    const ids: number[] = [];
    for (const group of groups) {
      if (!showGroups || !collapsedGroups.has(group.key)) {
        for (const account of group.accounts) ids.push(account.UserID);
      }
    }
    return ids;
  }, [groups, collapsedGroups, showGroups]);

  const selectedAccount = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return accounts.find((a) => a.UserID === id) || null;
  }, [accounts, selectedIds]);

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.UserID)),
    [accounts, selectedIds]
  );

  const handleSelect = useCallback(
    (userId: number, e: React.MouseEvent) => {
      const toggle = e.altKey || e.ctrlKey || e.metaKey;
      if (e.shiftKey && lastClickedId !== null) {
        const startIdx = orderedUserIds.indexOf(lastClickedId);
        const endIdx = orderedUserIds.indexOf(userId);
        if (startIdx >= 0 && endIdx >= 0) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          const range = new Set(orderedUserIds.slice(lo, hi + 1));
          if (toggle) {
            setSelectedIds((prev) => new Set([...prev, ...range]));
          } else {
            setSelectedIds(range);
          }
        }
      } else if (toggle) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(userId)) next.delete(userId);
          else next.add(userId);
          return next;
        });
      } else {
        setSelectedIds(new Set([userId]));
      }
      setLastClickedId(userId);
    },
    [lastClickedId, orderedUserIds]
  );

  const selectSingle = useCallback((userId: number) => {
    setSelectedIds(new Set([userId]));
    setLastClickedId(userId);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredAccounts.map((a) => a.UserID)));
  }, [filteredAccounts]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size > 0) return new Set();
      return new Set(filteredAccounts.map((a) => a.UserID));
    });
  }, [filteredAccounts]);

  const navigateSelection = useCallback(
    (direction: "up" | "down", shift: boolean) => {
      if (orderedUserIds.length === 0) return;

      const anchorId = lastClickedId ?? orderedUserIds[0];
      const currentIdx = orderedUserIds.indexOf(anchorId);
      if (currentIdx < 0) return;

      const nextIdx = direction === "up"
        ? Math.max(0, currentIdx - 1)
        : Math.min(orderedUserIds.length - 1, currentIdx + 1);
      const nextId = orderedUserIds[nextIdx];

      if (shift) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.add(nextId);
          return next;
        });
      } else {
        setSelectedIds(new Set([nextId]));
      }
      setLastClickedId(nextId);
    },
    [lastClickedId, orderedUserIds]
  );

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const setActionStatusMessage = useCallback(
    (message: string, tone: ActionStatusTone = "info", timeoutMs = 3500) => {
      if (actionStatusTimeoutRef.current !== null) {
        window.clearTimeout(actionStatusTimeoutRef.current);
        actionStatusTimeoutRef.current = null;
      }
      setActionStatus({
        message,
        tone,
        at: Date.now(),
      });
      if (timeoutMs > 0) {
        actionStatusTimeoutRef.current = window.setTimeout(() => {
          setActionStatus((prev) => (prev?.message === message ? null : prev));
          actionStatusTimeoutRef.current = null;
        }, timeoutMs);
      }
    },
    []
  );

  const addToast = useCallback((msg: string) => {
    setToasts((prev) => [...prev, msg]);
    setTimeout(() => setToasts((prev) => prev.slice(1)), 2500);
    const lower = msg.toLowerCase();
    let tone: ActionStatusTone = "info";
    if (lower.includes("error") || lower.includes("failed")) tone = "error";
    else if (lower.includes("saved") || lower.includes("updated") || lower.includes("launched")) tone = "success";
    else if (lower.includes("warning")) tone = "warn";
    setActionStatusMessage(msg, tone);
  }, [setActionStatusMessage]);

  function clearLaunchTimeout() {
    if (launchClearTimeoutRef.current !== null) {
      window.clearTimeout(launchClearTimeoutRef.current);
      launchClearTimeoutRef.current = null;
    }
  }

  const showModal = useCallback((title: string, content: string) => {
    setModal({ title, content });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const openContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  async function loadAvatars(accts: Account[]) {
    const ids = accts
      .map((a) => a.UserID)
      .filter((id) => !avatarUrls.has(id) && !avatarLoadingRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => avatarLoadingRef.current.add(id));
    try {
      const results = await invoke<ThumbnailData[]>("batched_get_avatar_headshots", {
        userIds: ids,
        size: "48x48",
      });
      setAvatarUrls((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.imageUrl) next.set(r.targetId, r.imageUrl);
        }
        return next;
      });
    } catch {
    } finally {
      ids.forEach((id) => avatarLoadingRef.current.delete(id));
    }
  }

  async function loadAccounts() {
    try {
      const result = await invoke<Account[]>("get_accounts");
      setAccounts(result);
      setError(null);
      loadAvatars(result);
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveAccounts() {
    try {
      await invoke("save_accounts");
      addToast("Accounts saved");
    } catch (e) {
      setError(String(e));
    }
  }

  async function addAccountByCookie(cookie: string) {
    try {
      const info = await invoke<{ user_id: number; name: string }>("validate_cookie", {
        cookie,
      });
      await invoke("add_account", {
        securityToken: cookie,
        username: info.name,
        userId: info.user_id,
      });
      await loadAccounts();
      addToast(`Added ${info.name}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeAccounts(userIds: number[]) {
    try {
      for (const id of userIds) {
        await invoke("remove_account", { userId: id });
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        userIds.forEach((id) => next.delete(id));
        return next;
      });
      await loadAccounts();
      addToast(`Removed ${userIds.length} account(s)`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function updateAccount(account: Account) {
    try {
      await invoke("update_account", { account });
      setAccounts((prev) => prev.map((a) => (a.UserID === account.UserID ? account : a)));
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshCookie(userId: number): Promise<boolean> {
    try {
      return await invoke<boolean>("refresh_cookie", { userId });
    } catch {
      return false;
    }
  }

  async function moveToGroup(userIds: number[], group: string) {
    const updated = accounts.map((a) =>
      userIds.includes(a.UserID) ? { ...a, Group: group } : a
    );
    setAccounts(updated);
    for (const a of updated) {
      if (userIds.includes(a.UserID)) {
        await invoke("update_account", { account: a }).catch(() => {});
      }
    }
    addToast(`Moved to ${parseGroupName(group).displayName}`);
  }

  function sortGroupAlphabetically(groupKey: string) {
    setAccounts((prev) => {
      const targetIndices: number[] = [];
      const targetAccounts: Account[] = [];

      prev.forEach((acc, idx) => {
        if ((acc.Group || "Default") === groupKey) {
          targetIndices.push(idx);
          targetAccounts.push(acc);
        }
      });

      if (targetAccounts.length <= 1) {
        return prev;
      }

      targetAccounts.sort((a, b) => {
        const na = a.Alias || a.Username;
        const nb = b.Alias || b.Username;
        return na.localeCompare(nb);
      });

      const next = [...prev];
      targetIndices.forEach((idx, i) => {
        next[idx] = targetAccounts[i];
      });

      invoke("reorder_accounts", {
        userIds: next.map((a) => a.UserID),
      }).catch(() => {});

      return next;
    });
    addToast(`Sorted ${parseGroupName(groupKey).displayName}`);
  }

  async function reorderAccounts(draggedUserId: number, targetUserId: number) {
    if (draggedUserId === targetUserId) return;

    const next = [...accounts];
    const from = next.findIndex((a) => a.UserID === draggedUserId);
    const to = next.findIndex((a) => a.UserID === targetUserId);
    if (from < 0 || to < 0) return;

    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setAccounts(next);

    try {
      await invoke("reorder_accounts", {
        userIds: next.map((a) => a.UserID),
      });
    } catch (e) {
      setError(String(e));
    }
  }

  async function openLoginBrowser() {
    try {
      await invoke("open_login_browser");
    } catch (e) {
      setError(String(e));
    }
  }

  async function openAccountBrowser(userId: number) {
    try {
      await invoke("open_account_browser", { userId });
    } catch (e) {
      setError(String(e));
    }
  }

  async function joinServer(userId: number) {
    clearLaunchTimeout();
    setJoiningAccounts(new Set([userId]));
    setLaunchProgress({
      mode: "single",
      current: 1,
      total: 1,
      userId,
    });
    const launchAccount = accounts.find((a) => a.UserID === userId);
    const accountName = launchAccount?.Alias || launchAccount?.Username || String(userId);
    setActionStatusMessage(`Launching ${accountName}...`, "info", 5000);

    try {
      const pid = parseInt(placeId) || 5315046213;
      const rawJobId = jobId.trim();
      let resolvedJobId = rawJobId;
      let joinVip = false;
      let linkCode = "";

      const vipPrefix = rawJobId.match(/^vip:\s*(.+)$/i);
      if (vipPrefix?.[1]) {
        joinVip = true;
        linkCode = vipPrefix[1].trim();
        resolvedJobId = "";
      } else {
        const linkLike = rawJobId.match(/(?:privateServerLinkCode|linkCode|code)=([^&\s]+)/i);
        if (linkLike?.[1]) {
          joinVip = true;
          try {
            linkCode = decodeURIComponent(linkLike[1]);
          } catch {
            linkCode = linkLike[1];
          }
          resolvedJobId = "";
        }
      }

      await invoke("launch_roblox", {
        userId,
        placeId: pid,
        jobId: resolvedJobId,
        launchData,
        followUser: false,
        joinVip,
        linkCode,
        shuffleJob: shuffleJobId,
      });
      addToast("Launching game...");
    } catch (e) {
      setJoiningAccounts((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setLaunchProgress((prev) => (prev?.mode === "single" && prev.userId === userId ? null : prev));
      setError(String(e));
      setActionStatusMessage(`Launch failed: ${e}`, "error", 5000);
      return;
    }

    launchClearTimeoutRef.current = window.setTimeout(() => {
      setJoiningAccounts((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setLaunchProgress((prev) => (prev?.mode === "single" && prev.userId === userId ? null : prev));
      launchClearTimeoutRef.current = null;
    }, 7000);
  }

  async function launchMultiple(userIds: number[]) {
    if (userIds.length === 0) return;

    clearLaunchTimeout();
    setJoiningAccounts(new Set([userIds[0]]));
    setLaunchProgress({
      mode: "multi",
      current: 0,
      total: userIds.length,
      userId: userIds[0],
    });
    setActionStatusMessage(`Launching ${userIds.length} accounts...`, "info", 5000);

    try {
      const pid = parseInt(placeId) || 5315046213;
      await invoke("launch_multiple", {
        userIds,
        placeId: pid,
        jobId,
        launchData,
      });
      addToast(`Launching ${userIds.length} accounts...`);
    } catch (e) {
      setJoiningAccounts(new Set());
      setLaunchProgress(null);
      setError(String(e));
      setActionStatusMessage(`Launch failed: ${e}`, "error", 5000);
      throw e;
    }
  }

  async function killAllRobloxProcesses() {
    try {
      const killed = await invoke<number>("cmd_kill_all_roblox");
      addToast(
        killed > 0
          ? `Closed ${killed} Roblox process${killed === 1 ? "" : "es"}`
          : "No open Roblox processes found"
      );
      setError(null);
    } catch (e) {
      setError(String(e));
      setActionStatusMessage(`Failed to close Roblox: ${e}`, "error", 5000);
    }
  }

  const applyThemePreview = useCallback((nextTheme: ThemeData) => {
    const normalized = normalizeTheme(nextTheme);
    setThemeState(normalized);
    applyThemeCssVariables(normalized);
  }, []);

  const saveTheme = useCallback(async (nextTheme: ThemeData) => {
    const normalized = normalizeTheme(nextTheme);
    await invoke("update_theme", { theme: normalized });
    setThemeState(normalized);
    applyThemeCssVariables(normalized);
  }, []);

  async function reloadSettings() {
    try {
      const s = await invoke<Record<string, Record<string, string>>>("get_all_settings");
      setSettings(s);
    } catch {}
  }

  async function unlock(password: string) {
    setUnlocking(true);
    setError(null);
    try {
      await invoke("unlock_accounts", { password });
      setNeedsPassword(false);
      await loadAccounts();
    } catch (e) {
      setError(String(e));
    } finally {
      setUnlocking(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const needs = await invoke<boolean>("needs_password");
        setNeedsPassword(needs);
        if (!needs) await loadAccounts();
      } catch (e) {
        setError(String(e));
      }
      try {
        const s = await invoke<Record<string, Record<string, string>>>("get_all_settings");
        setSettings(s);
        if (s?.General?.HideUsernames === "true") setHideUsernamesState(true);
        if (s?.General?.ShuffleJobId === "true") setShuffleJobId(true);
        if (s?.General?.SavedPlaceId) _setPlaceId(s.General.SavedPlaceId);
        if (s?.General?.SavedJobId) _setJobId(s.General.SavedJobId);
        if (s?.General?.SavedLaunchData) _setLaunchData(s.General.SavedLaunchData);
      } catch {}
      try {
        const t = await invoke<ThemeData>("get_theme");
        applyThemePreview(t);
      } catch {}
      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    const unlisten = listen("browser-login-detected", async () => {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const cookie = await invoke<string>("extract_browser_cookie");
        await addAccountByCookie(cookie);
        await invoke("close_login_browser");
      } catch (e) {
        addToast(String(e));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (needsPassword || !initialized) return;

    const unsubs: Array<() => void> = [];

    const listeners = [
      listen<{ userId: number; index: number; total: number }>("launch-progress", (e) => {
        const current = (e.payload.index ?? 0) + 1;
        const total = Math.max(1, e.payload.total ?? 1);
        const userId = e.payload.userId ?? null;
        setLaunchProgress({
          mode: "multi",
          current: Math.min(current, total),
          total,
          userId,
        });
        setJoiningAccounts(userId !== null ? new Set([userId]) : new Set());
        setActionStatusMessage(`Launching account ${current}/${total}...`, "info", 2000);
      }),
      listen("launch-complete", () => {
        setJoiningAccounts(new Set());
        setLaunchProgress((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            current: prev.total,
          };
        });
        setActionStatusMessage("Launch sequence complete", "success", 3000);
        clearLaunchTimeout();
        launchClearTimeoutRef.current = window.setTimeout(() => {
          setLaunchProgress((prev) => (prev?.mode === "multi" ? null : prev));
          launchClearTimeoutRef.current = null;
        }, 1500);
      }),
    ];

    Promise.all(listeners).then((fns) => fns.forEach((fn) => unsubs.push(fn)));

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [needsPassword, initialized, setActionStatusMessage]);

  useEffect(() => {
    if (needsPassword || !initialized) return;

    let cancelled = false;
    const refreshRunningInstances = async () => {
      try {
        const rows = await invoke<RunningInstanceEntry[]>("get_running_instances");
        const next = new Set<number>();
        for (const row of rows) {
          const userId = row.userId ?? row.user_id;
          if (typeof userId === "number") {
            next.add(userId);
          }
        }
        if (!cancelled) {
          setLaunchedByProgram(next);
        }
      } catch {
      }
    };

    refreshRunningInstances();
    const timer = window.setInterval(refreshRunningInstances, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [needsPassword, initialized]);

  useEffect(() => {
    function onActionStatus(event: Event) {
      const custom = event as CustomEvent<{ message?: string; tone?: ActionStatusTone; timeoutMs?: number }>;
      if (!custom.detail?.message) return;
      setActionStatusMessage(
        custom.detail.message,
        custom.detail.tone || "success",
        custom.detail.timeoutMs ?? 2800
      );
    }
    window.addEventListener("ram-action-status", onActionStatus as EventListener);
    return () => {
      window.removeEventListener("ram-action-status", onActionStatus as EventListener);
    };
  }, [setActionStatusMessage]);

  useEffect(() => {
    if (needsPassword || !initialized) return;

    if (settings?.General?.ShowPresence !== "true") {
      setPresenceByUserId(new Map());
      return;
    }

    let cancelled = false;
    const userIds = accounts.map((a) => a.UserID);
    const intervalMinutes = Math.max(
      1,
      parseInt(settings?.General?.PresenceUpdateRate || "5", 10) || 5
    );
    const intervalMs = Math.max(30_000, intervalMinutes * 60 * 1000);

    const refreshPresence = async () => {
      if (userIds.length === 0) {
        if (!cancelled) setPresenceByUserId(new Map());
        return;
      }

      const next = new Map<number, number>();
      try {
        for (let i = 0; i < userIds.length; i += 100) {
          const chunk = userIds.slice(i, i + 100);
          const result = await invoke<PresenceEntry[]>("get_presence", { userIds: chunk });
          for (const presence of result) {
            const userId = presence.userId ?? presence.user_id;
            const presenceType = presence.userPresenceType ?? presence.user_presence_type ?? 0;
            if (typeof userId === "number") {
              next.set(userId, presenceType);
            }
          }
        }
        if (!cancelled) {
          setPresenceByUserId(next);
        }
      } catch {
      }
    };

    refreshPresence();
    const timer = window.setInterval(refreshPresence, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    accounts,
    settings?.General?.ShowPresence,
    settings?.General?.PresenceUpdateRate,
    needsPassword,
    initialized,
  ]);

  useEffect(() => {
    if (needsPassword || !initialized) return;
    const autoRefresh = settings?.General?.AutoCookieRefresh;
    if (autoRefresh === "false") return;

    const interval = window.setInterval(async () => {
      const now = Date.now();
      for (const account of accounts) {
        if (account.Fields?.NoCookieRefresh === "true") continue;
        const daysSinceUse = (now - new Date(account.LastUse).getTime()) / 86400000;
        if (daysSinceUse < 20) continue;
        const daysSinceRefresh =
          (now - new Date(account.LastAttemptedRefresh).getTime()) / 86400000;
        if (daysSinceRefresh < 7) continue;
        await refreshCookie(account.UserID);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [accounts, needsPassword, initialized, settings]);

  useEffect(() => {
    if (needsPassword || !initialized) return;
    if (settings?.Watcher?.Enabled !== "true") {
      invoke("stop_watcher").catch(() => {});
      return;
    }

    const unsubs: Array<() => void> = [];
    invoke("start_watcher").catch(() => {});

    const listeners = [
      listen<{ userId: number }>("roblox-process-died", (e) => {
        addToast(`Watcher: process closed for ${e.payload.userId}`);
      }),
      listen<{ userId: number; memoryMb: number }>("roblox-low-memory", (e) => {
        addToast(`Watcher: low memory ${e.payload.memoryMb}MB (${e.payload.userId})`);
      }),
      listen<{ userId: number; expected: string }>("roblox-title-mismatch", (e) => {
        addToast(`Watcher: title mismatch for ${e.payload.userId} (${e.payload.expected})`);
      }),
      listen<{ userId: number; title: string }>("roblox-beta-detected", (e) => {
        addToast(`Watcher: beta build detected for ${e.payload.userId}`);
      }),
      listen<{ userId: number; timeout: number }>("roblox-no-connection", (e) => {
        addToast(`Watcher: no connection timeout (${e.payload.timeout}s) for ${e.payload.userId}`);
      }),
    ];

    Promise.all(listeners).then((fns) => fns.forEach((fn) => unsubs.push(fn)));

    return () => {
      invoke("stop_watcher").catch(() => {});
      unsubs.forEach((fn) => fn());
    };
  }, [needsPassword, initialized, settings?.Watcher?.Enabled, addToast]);

  useEffect(() => {
    return () => {
      clearLaunchTimeout();
      if (actionStatusTimeoutRef.current !== null) {
        window.clearTimeout(actionStatusTimeoutRef.current);
        actionStatusTimeoutRef.current = null;
      }
    };
  }, []);

  const value: StoreValue = {
    accounts,
    groups,
    loadAccounts,
    saveAccounts,
    addAccountByCookie,
    removeAccounts,
    updateAccount,
    selectedIds,
    selectedAccount,
    selectedAccounts,
    handleSelect,
    selectSingle,
    selectAll,
    deselectAll,
    toggleSelectAll,
    setSelectedIds,
    navigateSelection,
    orderedUserIds,
    searchQuery,
    setSearchQuery,
    showGroups,
    setShowGroups,
    collapsedGroups,
    toggleGroup,
    sidebarOpen,
    setSidebarOpen,
    hideUsernames,
    setHideUsernames,
    hiddenNameLetters,
    showAvatarsWhenHidden,
    hideRobuxWhenHidden,
    placeId,
    setPlaceId,
    jobId,
    setJobId,
    launchData,
    setLaunchData,
    shuffleJobId,
    setShuffleJobId,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    settings,
    theme,
    applyThemePreview,
    saveTheme,
    devMode,
    avatarUrls,
    presenceByUserId,
    launchedByProgram,
    joinServer,
    launchMultiple,
    killAllRobloxProcesses,
    refreshCookie,
    moveToGroup,
    sortGroupAlphabetically,
    reorderAccounts,
    joiningAccounts,
    launchProgress,
    dragState,
    setDragState,
    toasts,
    addToast,
    actionStatus,
    modal,
    showModal,
    closeModal,
    error,
    setError,
    needsPassword,
    unlocking,
    unlock,
    initialized,
    settingsOpen,
    setSettingsOpen,
    reloadSettings,
    serverListOpen,
    setServerListOpen,
    accountUtilsOpen,
    setAccountUtilsOpen,
    accountFieldsOpen,
    setAccountFieldsOpen,
    importDialogOpen,
    setImportDialogOpen,
    importDialogTab,
    setImportDialogTab,
    themeEditorOpen,
    setThemeEditorOpen,
    missingAssets,
    setMissingAssets,
    nexusOpen,
    setNexusOpen,
    openLoginBrowser,
    openAccountBrowser,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
