import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { useModalClose } from "../../hooks/useModalClose";
import { useTr } from "../../i18n/text";

interface BottingDialogProps {
  open: boolean;
  onClose: () => void;
}

function formatRemaining(targetMs: number | null, nowMs: number): string {
  if (!targetMs || targetMs <= nowMs) return "due";
  const secs = Math.ceil((targetMs - nowMs) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function phaseTone(phase: string): string {
  const p = phase.toLowerCase();
  if (p.includes("player")) return "text-sky-300";
  if (p.includes("retry") || p.includes("backoff")) return "text-amber-300";
  if (p.includes("error")) return "text-red-300";
  if (p.includes("launch") || p.includes("restart")) return "text-violet-300";
  return "text-emerald-300";
}

export function BottingDialog({ open, onClose }: BottingDialogProps) {
  const t = useTr();
  const store = useStore();
  const { visible, closing, handleClose } = useModalClose(open, onClose);
  const selectedAccounts = store.selectedAccounts;
  const selectedIds = useMemo(
    () => selectedAccounts.map((a) => a.UserID),
    [selectedAccounts]
  );
  const status = store.bottingStatus;
  const [placeId, setPlaceId] = useState("");
  const [jobId, setJobId] = useState("");
  const [launchData, setLaunchData] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(19);
  const [launchDelaySeconds, setLaunchDelaySeconds] = useState(20);
  const [playerUserId, setPlayerUserId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const playerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      let general = store.settings?.General || {};
      try {
        const fresh = await invoke<Record<string, Record<string, string>>>("get_all_settings");
        if (fresh?.General) {
          general = fresh.General;
        }
      } catch {}
      if (cancelled) return;

      const draftPlace = general.BottingDraftPlaceId || store.placeId || "";
      const draftJob = general.BottingDraftJobId || store.jobId || "";
      const draftData = general.BottingDraftLaunchData || store.launchData || "";
      const draftInterval = parseInt(general.BottingDefaultIntervalMinutes || "19", 10);
      const draftDelay = parseInt(general.BottingLaunchDelaySeconds || "20", 10);
      const draftPlayer = parseInt(general.BottingDraftPlayerAccountId || "", 10);

      setPlaceId(draftPlace);
      setJobId(draftJob);
      setLaunchData(draftData);
      setIntervalMinutes(Number.isFinite(draftInterval) ? draftInterval : 19);
      setLaunchDelaySeconds(Number.isFinite(draftDelay) ? draftDelay : 20);
      setPlayerUserId(
        Number.isFinite(draftPlayer) && selectedIds.includes(draftPlayer) ? draftPlayer : null
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, store.settings, store.placeId, store.jobId, store.launchData, selectedIds]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setPlayerMenuOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!playerMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (!playerMenuRef.current) return;
      if (!playerMenuRef.current.contains(e.target as Node)) {
        setPlayerMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [playerMenuOpen]);

  async function saveDraft(
    nextPlaceId: string,
    nextJobId: string,
    nextLaunchData: string,
    nextPlayer: number | null,
    nextInterval: number,
    nextDelay: number
  ) {
    const updates = [
      invoke("update_setting", {
        section: "General",
        key: "BottingDraftPlaceId",
        value: nextPlaceId,
      }),
      invoke("update_setting", {
        section: "General",
        key: "BottingDraftJobId",
        value: nextJobId,
      }),
      invoke("update_setting", {
        section: "General",
        key: "BottingDraftLaunchData",
        value: nextLaunchData,
      }),
      invoke("update_setting", {
        section: "General",
        key: "BottingDraftPlayerAccountId",
        value: nextPlayer === null ? "" : String(nextPlayer),
      }),
      invoke("update_setting", {
        section: "General",
        key: "BottingDraftSelectedUserIds",
        value: selectedIds.join(","),
      }),
      invoke("update_setting", {
        section: "General",
        key: "BottingDefaultIntervalMinutes",
        value: String(nextInterval),
      }),
      invoke("update_setting", {
        section: "General",
        key: "BottingLaunchDelaySeconds",
        value: String(nextDelay),
      }),
    ];
    await Promise.all(updates.map((p) => p.catch(() => {})));
  }

  async function handleStart() {
    const pid = parseInt(placeId.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      store.addToast(t("Place ID is required"));
      return;
    }
    if (selectedIds.length < 2) {
      store.addToast(t("Select at least 2 accounts"));
      return;
    }
    setBusy(true);
    try {
      await saveDraft(
        placeId.trim(),
        jobId.trim(),
        launchData,
        playerUserId,
        intervalMinutes,
        launchDelaySeconds
      );
      await store.startBottingMode({
        userIds: selectedIds,
        placeId: pid,
        jobId: jobId.trim(),
        launchData,
        playerUserId,
        intervalMinutes,
        launchDelaySeconds,
      });
    } catch {}
    setBusy(false);
  }

  async function handlePlayerChange(next: string) {
    const parsed = parseInt(next, 10);
    const nextId = Number.isFinite(parsed) ? parsed : null;
    setPlayerUserId(nextId);
    await saveDraft(
      placeId.trim(),
      jobId.trim(),
      launchData,
      nextId,
      intervalMinutes,
      launchDelaySeconds
    );
    if (status?.active) {
      await store.setBottingPlayerAccount(nextId);
    }
  }

  if (!visible) return null;

  const statusMap = new Map((status?.accounts || []).map((a) => [a.userId, a]));
  const canStart = selectedIds.length >= 2 && !!placeId.trim() && !busy;
  const playerAccountLabel =
    playerUserId === null
      ? t("None")
      : selectedAccounts.find((a) => a.UserID === playerUserId)?.Alias ||
        selectedAccounts.find((a) => a.UserID === playerUserId)?.Username ||
        t("Unknown");

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm ${
        closing ? "animate-fade-out" : "animate-fade-in"
      }`}
      onClick={handleClose}
    >
      <div
        className={`theme-panel theme-border rounded-2xl border w-[760px] max-w-[calc(100vw-24px)] max-h-[88vh] overflow-hidden shadow-2xl ${
          closing ? "animate-scale-out" : "animate-scale-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b theme-border flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold text-[var(--panel-fg)]">{t("Botting Mode")}</div>
            <div className="text-[11px] theme-muted mt-0.5">
              {t("Keep selected accounts rejoining to hold server population")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded-full text-[10px] border ${
                status?.active
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 animate-pulse"
                  : "theme-border theme-soft theme-muted"
              }`}
            >
              {status?.active ? t("RUNNING") : t("IDLE")}
            </span>
            <button
              onClick={handleClose}
              className="p-1 rounded-md theme-muted hover:text-[var(--panel-fg)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(88vh-130px)] space-y-4">
          <section
            className={`theme-surface rounded-xl border theme-border p-3 animate-fade-in relative ${
              playerMenuOpen ? "z-30" : "z-10"
            }`}
          >
            <div className="text-[12px] font-medium text-[var(--panel-fg)] mb-2">{t("Targets")}</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedAccounts.map((a) => (
                <span
                  key={a.UserID}
                  className="px-2 py-1 rounded-md text-[11px] border theme-border theme-soft text-[var(--panel-fg)]"
                >
                  {a.Alias || a.Username}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] theme-muted w-24 shrink-0">{t("Player Account")}</label>
              <div ref={playerMenuRef} className="relative w-full">
                <button
                  type="button"
                  onClick={() => setPlayerMenuOpen((v) => !v)}
                  className="sidebar-input text-xs flex items-center justify-between gap-2 hover:brightness-110 transition-all"
                  aria-haspopup="listbox"
                  aria-expanded={playerMenuOpen}
                >
                  <span className="truncate">{playerAccountLabel}</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`theme-muted transition-transform duration-150 ${
                      playerMenuOpen ? "rotate-180" : ""
                    }`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div
                  className={`absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-lg border theme-border theme-panel shadow-2xl overflow-hidden transition-all duration-150 ${
                    playerMenuOpen
                      ? "opacity-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 -translate-y-1 pointer-events-none"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      handlePlayerChange("");
                      setPlayerMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-[12px] transition-colors ${
                      playerUserId === null
                        ? "theme-accent-bg theme-accent"
                        : "text-[var(--panel-fg)] hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    {t("None")}
                  </button>
                  <div className="h-px theme-border border-t" />
                  {selectedAccounts.map((a) => {
                    const active = playerUserId === a.UserID;
                    return (
                      <button
                        key={a.UserID}
                        type="button"
                        onClick={() => {
                          handlePlayerChange(String(a.UserID));
                          setPlayerMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-[12px] transition-colors ${
                          active
                            ? "theme-accent-bg theme-accent"
                            : "text-[var(--panel-fg)] hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        {a.Alias || a.Username}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="theme-surface rounded-xl border theme-border p-3 animate-fade-in">
            <div className="text-[12px] font-medium text-[var(--panel-fg)] mb-2">{t("Server")}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                onBlur={() =>
                  saveDraft(placeId.trim(), jobId.trim(), launchData, playerUserId, intervalMinutes, launchDelaySeconds)
                }
                placeholder={t("Place ID")}
                className="sidebar-input text-xs font-mono"
              />
              <input
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                onBlur={() =>
                  saveDraft(placeId.trim(), jobId.trim(), launchData, playerUserId, intervalMinutes, launchDelaySeconds)
                }
                placeholder={t("Job ID (optional)")}
                className="sidebar-input text-xs font-mono"
              />
              <input
                value={launchData}
                onChange={(e) => setLaunchData(e.target.value)}
                onBlur={() =>
                  saveDraft(placeId.trim(), jobId.trim(), launchData, playerUserId, intervalMinutes, launchDelaySeconds)
                }
                placeholder={t("JoinData (optional)")}
                className="sidebar-input text-xs"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  setPlaceId(store.placeId);
                  setJobId(store.jobId);
                  setLaunchData(store.launchData);
                }}
                className="sidebar-btn-sm"
              >
                {t("Use Current Launch Fields")}
              </button>
            </div>
          </section>

          <section className="theme-surface rounded-xl border theme-border p-3 animate-fade-in">
            <div className="text-[12px] font-medium text-[var(--panel-fg)] mb-2">{t("Timing")}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] theme-muted w-36 shrink-0">{t("Rejoin Interval (minutes)")}</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(parseInt(e.target.value || "19", 10))}
                  onBlur={() =>
                    saveDraft(placeId.trim(), jobId.trim(), launchData, playerUserId, intervalMinutes, launchDelaySeconds)
                  }
                  className="sidebar-input text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] theme-muted w-36 shrink-0">{t("Launch Delay (seconds)")}</label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={launchDelaySeconds}
                  onChange={(e) => setLaunchDelaySeconds(parseInt(e.target.value || "20", 10))}
                  onBlur={() =>
                    saveDraft(placeId.trim(), jobId.trim(), launchData, playerUserId, intervalMinutes, launchDelaySeconds)
                  }
                  className="sidebar-input text-xs"
                />
              </div>
            </div>
            <div className="text-[10px] theme-muted mt-2">
              {t("Player account demotion grace is 15 minutes before it enters normal restart cycle.")}
            </div>
          </section>

          <section className="theme-surface rounded-xl border theme-border p-3 animate-fade-in">
            <div className="text-[12px] font-medium text-[var(--panel-fg)] mb-2">{t("Live Cycle")}</div>
            <div className="space-y-1.5">
              {selectedAccounts.map((a) => {
                const row = statusMap.get(a.UserID);
                return (
                  <div
                    key={a.UserID}
                    className="flex items-center justify-between rounded-lg border theme-border px-2.5 py-1.5 theme-soft"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] text-[var(--panel-fg)] truncate">
                        {a.Alias || a.Username}
                      </div>
                      <div className={`text-[10px] ${phaseTone(row?.phase || "idle")}`}>
                        {t(row?.phase || "idle")}
                        {row?.lastError ? ` - ${row.lastError}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-[var(--panel-fg)]">
                        {t(formatRemaining(row?.nextRestartAtMs ?? null, nowMs))}
                      </div>
                      <div className="text-[10px] theme-muted">
                        {t("retries")}: {row?.retryCount || 0}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="px-5 py-4 border-t theme-border flex flex-wrap items-center gap-2 justify-end">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="sidebar-btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("Start Botting Mode")}
          </button>
          <button
            onClick={() => store.stopBottingMode(false)}
            className="sidebar-btn-sm"
          >
            {t("Stop Botting Mode")}
          </button>
          <button
            onClick={() => store.stopBottingMode(true)}
            className="sidebar-btn-sm text-red-200 border-red-400/40 hover:bg-red-500/15"
          >
            {t("Stop + Close Bot Accounts")}
          </button>
        </div>
      </div>
    </div>
  );
}
