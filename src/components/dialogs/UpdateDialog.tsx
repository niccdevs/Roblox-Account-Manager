import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X } from "lucide-react";
import { useStore } from "../../store";
import { useModalClose } from "../../hooks/useModalClose";
import { useTr } from "../../i18n/text";

type Phase = "available" | "downloading" | "ready" | "installing" | "error";

function renderMarkdown(src: string): React.ReactNode[] {
  const htmlTag = /<[a-z][^>]*>/i;
  const lines = src.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let inFence = false;
  let fenceChar = "`";
  let fenceLength = 3;
  let fenceLang = "";
  let fenceLines: string[] = [];

  function pushFence() {
    const code = fenceLines.join("\n");
    if (!code.trim()) return;
    nodes.push(
      <div key={key++} className="my-1 rounded-lg border theme-border bg-black/25 overflow-hidden">
        {fenceLang ? (
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-zinc-400/80 border-b theme-border bg-black/20">
            {fenceLang}
          </div>
        ) : null}
        <pre className="px-3 py-2 text-[11px] leading-relaxed overflow-x-auto">
          <code className="font-mono whitespace-pre text-zinc-200">{code}</code>
        </pre>
      </div>
    );
  }

  function inlinePass(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    const re = /\*\*(.+?)\*\*|`([^`\n]+)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > cursor) parts.push(text.slice(cursor, m.index));
      if (m[1]) {
        parts.push(<strong key={key++} className="font-semibold text-[var(--panel-fg)]">{m[1]}</strong>);
      } else if (m[2]) {
        parts.push(
          <code key={key++} className="font-mono text-[11px] px-1 py-0.5 rounded bg-black/30 border border-white/10 text-zinc-200">
            {m[2]}
          </code>
        );
      } else if (m[3] && m[4]) {
        parts.push(
          <a key={key++} href={m[4]} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline break-all">
            {m[3]}
          </a>
        );
      } else if (m[5]) {
        parts.push(
          <a key={key++} href={m[5]} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline break-all">
            {m[5]}
          </a>
        );
      }
      cursor = m.index + m[0].length;
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*([a-zA-Z0-9_-]+)?\s*$/);

    if (fence) {
      const marker = fence[1];
      const nextChar = marker.startsWith("~") ? "~" : "`";
      if (!inFence) {
        inFence = true;
        fenceChar = nextChar;
        fenceLength = marker.length;
        fenceLang = (fence[2] || "").toLowerCase();
        fenceLines = [];
        continue;
      }

      if (fenceChar === nextChar && marker.length === fenceLength) {
        pushFence();
        inFence = false;
        fenceLength = 3;
        fenceLang = "";
        fenceLines = [];
        continue;
      }

      fenceLines.push(line);
      continue;
    }

    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    if (htmlTag.test(line)) continue;

    if (/^>\s*\[!WARNING\]/.test(line)) continue;

    if (/^>\s*/.test(line)) {
      const text = line.replace(/^>\s*/, "");
      if (!text.trim()) continue;
      nodes.push(
        <div key={key++} className="border-l-2 border-amber-500/50 pl-2.5 py-0.5 text-amber-200/80">
          {inlinePass(text)}
        </div>
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const sizeClass = level <= 2 ? "text-[11px]" : "text-[10.5px]";
      nodes.push(
        <div key={key++} className={`${sizeClass} font-semibold text-[var(--panel-fg)] mt-2.5 mb-1 uppercase tracking-wide opacity-70`}>
          {text}
        </div>
      );
      continue;
    }

    const unordered = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (unordered) {
      const indentLevel = Math.min(4, Math.floor(unordered[1].replace(/\t/g, "  ").length / 2));
      const task = unordered[2].match(/^\[( |x|X)\]\s+(.+)$/);
      const content = task ? task[2] : unordered[2];
      const marker = task ? (task[1].toLowerCase() === "x" ? "✓" : "◦") : "•";
      nodes.push(
        <div key={key++} className="flex gap-1.5" style={{ paddingLeft: `${4 + indentLevel * 12}px` }}>
          <span className="text-sky-400/60 shrink-0 mt-px">{marker}</span>
          <span>{inlinePass(content)}</span>
        </div>
      );
      continue;
    }

    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      const indentLevel = Math.min(4, Math.floor(ordered[1].replace(/\t/g, "  ").length / 2));
      nodes.push(
        <div key={key++} className="flex gap-1.5" style={{ paddingLeft: `${4 + indentLevel * 12}px` }}>
          <span className="text-sky-400/60 shrink-0 mt-px min-w-[1.6em] text-right">{ordered[2]}.</span>
          <span>{inlinePass(ordered[3])}</span>
        </div>
      );
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line)) {
      nodes.push(<div key={key++} className="h-px bg-[var(--border-color)]/70 my-2" />);
      continue;
    }

    if (!line.trim()) {
      nodes.push(<div key={key++} className="h-1.5" />);
      continue;
    }

    nodes.push(<div key={key++}>{inlinePass(line)}</div>);
  }

  if (inFence) {
    pushFence();
  }

  return nodes;
}

interface DownloadProgress {
  downloaded: number;
  total: number | null;
  speed: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateDialog() {
  const t = useTr();
  const store = useStore();
  const open = store.updateDialogOpen;
  const info = store.updateInfo;
  const { visible, closing, handleClose } = useModalClose(open, () =>
    store.setUpdateDialogOpen(false)
  );

  const [phase, setPhase] = useState<Phase>("available");
  const [progress, setProgress] = useState<DownloadProgress>({ downloaded: 0, total: null, speed: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);
  const speedSamplesRef = useRef<{ time: number; bytes: number }[]>([]);
  const renderedNotes = useMemo(() => (releaseNotes ? renderMarkdown(releaseNotes) : null), [releaseNotes]);

  useEffect(() => {
    if (!open) {
      setPhase("available");
      setProgress({ downloaded: 0, total: null, speed: 0 });
      setErrorMsg("");
      setReleaseNotes(null);
      speedSamplesRef.current = [];
      return;
    }

    const nextNotes = info?.body?.trim() ? info.body : null;
    setReleaseNotes(nextNotes);
  }, [open, info?.body]);

  const startDownload = useCallback(async () => {
    setPhase("downloading");
    setProgress({ downloaded: 0, total: null, speed: 0 });
    speedSamplesRef.current = [{ time: Date.now(), bytes: 0 }];

    try {
      const update = await check();
      if (!update) {
        setPhase("error");
        setErrorMsg(t("No updates available"));
        return;
      }
      updateRef.current = update;

      let totalLen: number | null = null;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalLen = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          const now = Date.now();
          const chunk = event.data.chunkLength;

          setProgress((prev) => {
            const downloaded = prev.downloaded + chunk;
            speedSamplesRef.current.push({ time: now, bytes: downloaded });
            const cutoff = now - 2000;
            speedSamplesRef.current = speedSamplesRef.current.filter((s) => s.time >= cutoff);

            let speed = 0;
            const samples = speedSamplesRef.current;
            if (samples.length >= 2) {
              const oldest = samples[0];
              const newest = samples[samples.length - 1];
              const dt = (newest.time - oldest.time) / 1000;
              if (dt > 0) speed = (newest.bytes - oldest.bytes) / dt;
            }

            return { downloaded, total: totalLen, speed };
          });
        } else if (event.event === "Finished") {
          setPhase("ready");
        }
      });

      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setErrorMsg(String(e));
    }
  }, [t]);

  const installAndRestart = useCallback(async () => {
    setPhase("installing");
    try {
      await relaunch();
    } catch (e) {
      setPhase("error");
      setErrorMsg(String(e));
    }
  }, []);

  const skipVersion = useCallback(() => {
    if (info) {
      localStorage.setItem("skipped-update-version", info.version);
    }
    handleClose();
  }, [info, handleClose]);

  if (!visible || !info) return null;

  const pct = progress.total ? Math.round((progress.downloaded / progress.total) * 100) : 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${closing ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={phase === "downloading" || phase === "installing" ? undefined : handleClose}
    >
      <div
        className={`theme-panel theme-border rounded-xl w-full max-w-lg mx-4 shadow-2xl flex flex-col ${closing ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
              <Download size={18} strokeWidth={2} className="text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--panel-fg)]">{t("Update Available")}</h2>
              <p className="text-xs theme-muted mt-0.5">
                v{info.currentVersion} → v{info.version}
              </p>
            </div>
          </div>
          {phase !== "downloading" && phase !== "installing" && (
            <button onClick={handleClose} className="theme-muted hover:opacity-100 transition-opacity">
              <X size={16} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="px-5 pb-3">
          <div className="text-xs font-medium theme-muted mb-1.5">{t("Release Notes")}</div>
          <div className="theme-input rounded-lg p-3 max-h-48 overflow-y-auto text-xs text-[var(--panel-fg)] leading-relaxed">
            {releaseNotes
              ? renderedNotes
              : t("Could not load release notes")}
          </div>
        </div>

        {(phase === "downloading" || phase === "ready") && (
          <div className="px-5 pb-3">
            <div className="w-full h-2 rounded-full bg-zinc-700/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${progress.total ? pct : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs theme-muted">
              <span>
                {progress.total
                  ? `${pct}% — ${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
                  : formatBytes(progress.downloaded)}
              </span>
              {phase === "downloading" && progress.speed > 0 && (
                <span>{formatBytes(progress.speed)}/s</span>
              )}
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="px-5 pb-3">
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
              {errorMsg}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 pb-5 pt-2 border-t border-[var(--border-color)]">
          <div className="flex gap-2">
            {phase === "available" && (
              <>
                <button
                  onClick={skipVersion}
                  className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
                >
                  {t("Skip This Version")}
                </button>
                <button
                  onClick={handleClose}
                  className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
                >
                  {t("Remind Me Later")}
                </button>
              </>
            )}
          </div>
          <div>
            {phase === "available" && (
              <button
                onClick={startDownload}
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                {t("Download Update")}
              </button>
            )}
            {phase === "downloading" && (
              <button
                disabled
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-sky-600/50 text-white/60 cursor-not-allowed"
              >
                {t("Downloading update...")}
              </button>
            )}
            {phase === "ready" && (
              <button
                onClick={installAndRestart}
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                {t("Install & Restart")}
              </button>
            )}
            {phase === "installing" && (
              <button
                disabled
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-emerald-600/50 text-white/60 cursor-not-allowed"
              >
                {t("Installing...")}
              </button>
            )}
            {phase === "error" && (
              <button
                onClick={startDownload}
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                {t("Download Update")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
