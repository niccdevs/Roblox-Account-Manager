import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { useModalClose } from "../../hooks/useModalClose";
import { SlidingTabBar } from "../ui/SlidingTabBar";

type TabId = "cookie" | "userpass";

interface ImportResult {
  text: string;
  ok: boolean;
}

export function ImportDialog({
  open,
  onClose,
  defaultTab = "cookie",
}: {
  open: boolean;
  onClose: () => void;
  defaultTab?: TabId;
}) {
  const store = useStore();
  const { visible, closing, handleClose } = useModalClose(open, onClose);
  const [tab, setTab] = useState<TabId>("cookie");
  const [input, setInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    setInput("");
    setResults([]);
    setProgress("");
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose, defaultTab]);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, tab]);

  if (!visible) return null;

  async function handleImportCookie() {
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setImporting(true);
    setResults([]);

    const existingIds = new Set(store.accounts.map((a) => a.UserID));
    const out: ImportResult[] = [];

    for (let i = 0; i < lines.length; i++) {
      setProgress(`Importing ${i + 1}/${lines.length}...`);
      const cookie = lines[i];
      try {
        const info = await invoke<{ user_id: number; name: string }>("validate_cookie", { cookie });
        if (existingIds.has(info.user_id)) {
          out.push({ text: `${info.name} — already exists`, ok: false });
        } else {
          await invoke("add_account", {
            securityToken: cookie,
            username: info.name,
            userId: info.user_id,
          });
          existingIds.add(info.user_id);
          out.push({ text: `Added ${info.name}`, ok: true });
        }
      } catch (e) {
        out.push({ text: `Failed: ${e}`, ok: false });
      }
      setResults([...out]);
    }

    await store.loadAccounts();
    setProgress("");
    setImporting(false);
  }

  async function handleImportUserPass() {
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setImporting(true);
    setResults([]);

    const existingIds = new Set(store.accounts.map((a) => a.UserID));
    const out: ImportResult[] = [];

    for (let i = 0; i < lines.length; i++) {
      setProgress(`Importing ${i + 1}/${lines.length}...`);
      const line = lines[i];
      const colonIdx = line.indexOf(":");
      if (colonIdx < 1) {
        out.push({ text: `Invalid format: ${line.slice(0, 30)}`, ok: false });
        setResults([...out]);
        continue;
      }
      const username = line.slice(0, colonIdx);
      const password = line.slice(colonIdx + 1);

      try {
        const user = await invoke<{ id: number; name: string }>("lookup_user", { username });
        if (existingIds.has(user.id)) {
          out.push({ text: `${user.name} — already exists`, ok: false });
        } else {
          await invoke("add_account", {
            securityToken: "",
            username: user.name,
            userId: user.id,
          });
          await invoke("update_account", {
            account: {
              Valid: false,
              SecurityToken: "",
              Username: user.name,
              LastUse: new Date().toISOString(),
              Alias: "",
              Description: "",
              Password: password,
               Group: "",
               UserID: user.id,
               Fields: {},
               LastAttemptedRefresh: new Date().toISOString(),
               BrowserTrackerID: "",
             },
           });
          existingIds.add(user.id);
          out.push({ text: `Added ${user.name} (no cookie)`, ok: true });
        }
      } catch (e) {
        out.push({ text: `Failed ${username}: ${e}`, ok: false });
      }
      setResults([...out]);
    }

    await store.loadAccounts();
    setProgress("");
    setImporting(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain");
    if (text) setInput((prev) => (prev ? prev + "\n" + text : text));
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "cookie", label: "Import by Cookie" },
    { id: "userpass", label: "Import by User:Pass" },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${closing ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={handleClose}
    >
      <div
        className={`bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl w-[560px] max-h-[420px] flex flex-col overflow-hidden ${closing ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <h2 className="text-sm font-semibold text-zinc-100">Import Accounts</h2>
          <button onClick={handleClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="pt-1">
          <SlidingTabBar
            tabs={tabs}
            activeTab={tab}
            onTabChange={(id) => { setTab(id); setResults([]); setInput(""); }}
          />
        </div>

        <div className="flex-1 flex flex-col px-5 pb-4 min-h-0">
          <p className="text-[11px] text-zinc-500 mb-2">
            {tab === "cookie"
              ? "Paste one .ROBLOSECURITY cookie per line"
              : "Paste one username:password per line"}
          </p>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            disabled={importing}
            placeholder={tab === "cookie" ? "_|WARNING:-DO-NOT-SHARE..." : "username:password123"}
            className="flex-1 min-h-[100px] max-h-[140px] w-full p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 font-mono placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-600 transition-colors disabled:opacity-50"
            spellCheck={false}
          />

          {results.length > 0 && (
            <div className="mt-2 max-h-[80px] overflow-y-auto space-y-0.5">
              {results.map((r, i) => (
                <div key={i} className={`text-[11px] ${r.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {r.text}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-zinc-500">{progress}</span>
            <button
              onClick={tab === "cookie" ? handleImportCookie : handleImportUserPass}
              disabled={importing || !input.trim()}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {importing ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
