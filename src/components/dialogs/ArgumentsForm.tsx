import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";

export function ArgumentsForm({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const store = useStore();
  const [isTeleport, setIsTeleport] = useState(false);
  const [useOldJoin, setUseOldJoin] = useState(false);
  const [version, setVersion] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const s = store.settings;
    if (s?.Developer) {
      setIsTeleport(s.Developer.IsTeleport === "true");
      setUseOldJoin(s.Developer.UseOldJoin === "true");
      setVersion(s.Developer.CurrentVersion || "");
    }
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!open) return null;

  function toggle(key: string, val: boolean, setter: (v: boolean) => void) {
    setter(val);
    invoke("update_setting", { section: "Developer", key, value: String(val) }).catch(() => {});
  }

  function handleSetVersion() {
    invoke("update_setting", {
      section: "Developer",
      key: "CurrentVersion",
      value: version,
    }).catch(() => {});
    store.addToast("Version set");
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1.5 w-[280px] bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl z-50 animate-scale-in p-3 space-y-2.5"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Launch Arguments
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isTeleport}
          onChange={(e) => toggle("IsTeleport", e.target.checked, setIsTeleport)}
          className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-0 focus:ring-offset-0"
        />
        <span className="text-xs text-zinc-300">Is Teleport</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={useOldJoin}
          onChange={(e) => toggle("UseOldJoin", e.target.checked, setUseOldJoin)}
          className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-0 focus:ring-offset-0"
        />
        <span className="text-xs text-zinc-300">Use Old Join Method</span>
      </label>

      <div className="flex items-center gap-2">
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="Roblox Version"
          className="flex-1 px-2.5 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
          spellCheck={false}
        />
        <button
          onClick={handleSetVersion}
          className="px-2.5 py-1.5 bg-zinc-800 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Set
        </button>
      </div>
    </div>
  );
}
