import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { useModalClose } from "../../hooks/useModalClose";
import type { ThemeData } from "../../types";
import { ColorRow } from "../ui/ColorRow";
import { ToggleRow } from "../ui/ToggleRow";

type Category = "Accounts" | "Buttons" | "Forms" | "Text Boxes" | "Labels";

const CATEGORIES: Category[] = ["Accounts", "Buttons", "Forms", "Text Boxes", "Labels"];

const DEFAULT_THEME: ThemeData = {
  accounts_background: "#18181b",
  accounts_foreground: "#e4e4e7",
  buttons_background: "#27272a",
  buttons_foreground: "#e4e4e7",
  buttons_border: "#3f3f46",
  forms_background: "#18181b",
  forms_foreground: "#e4e4e7",
  textboxes_background: "#27272a80",
  textboxes_foreground: "#e4e4e7",
  textboxes_border: "#27272a",
  label_background: "transparent",
  label_foreground: "#a1a1aa",
  label_transparent: true,
  dark_top_bar: false,
  show_headers: true,
  light_images: false,
  button_style: "Flat",
};

export function ThemeEditorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { visible, closing, handleClose } = useModalClose(open, onClose);
  const [category, setCategory] = useState<Category>("Accounts");
  const [theme, setThemeLocal] = useState<ThemeData>({ ...DEFAULT_THEME });

  useEffect(() => {
    if (!open) return;
    if (store.theme) setThemeLocal({ ...store.theme });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const applyLive = useCallback(
    (updated: ThemeData) => {
      const s = document.documentElement.style;
      s.setProperty("--accounts-bg", updated.accounts_background);
      s.setProperty("--accounts-fg", updated.accounts_foreground);
      s.setProperty("--buttons-bg", updated.buttons_background);
      s.setProperty("--buttons-fg", updated.buttons_foreground);
      s.setProperty("--buttons-bc", updated.buttons_border);
      s.setProperty("--forms-bg", updated.forms_background);
      s.setProperty("--forms-fg", updated.forms_foreground);
      s.setProperty("--textboxes-bg", updated.textboxes_background);
      s.setProperty("--textboxes-fg", updated.textboxes_foreground);
      s.setProperty("--textboxes-bc", updated.textboxes_border);
      s.setProperty("--labels-bg", updated.label_transparent ? "transparent" : updated.label_background);
      s.setProperty("--labels-fg", updated.label_foreground);
    },
    []
  );

  if (!visible) return null;

  function update(partial: Partial<ThemeData>) {
    setThemeLocal((prev) => {
      const next = { ...prev, ...partial };
      applyLive(next);
      return next;
    });
  }

  async function handleSave() {
    try {
      await invoke("update_theme", { theme });
      store.addToast("Theme saved");
      handleClose();
    } catch (e) {
      store.addToast(`Error: ${e}`);
    }
  }

  function handleReset() {
    const defaults = { ...DEFAULT_THEME };
    setThemeLocal(defaults);
    applyLive(defaults);
  }

  function cycleButtonStyle() {
    const styles = ["Flat", "Popup", "Standard"];
    const idx = styles.indexOf(theme.button_style);
    const next = styles[(idx + 1) % styles.length];
    update({ button_style: next });
  }

  function renderControls() {
    switch (category) {
      case "Accounts":
        return (
          <>
            <ColorRow label="Background" value={theme.accounts_background} onChange={(v) => update({ accounts_background: v })} />
            <ColorRow label="Foreground" value={theme.accounts_foreground} onChange={(v) => update({ accounts_foreground: v })} />
            <ToggleRow label="Show Headers" checked={theme.show_headers} onChange={(v) => update({ show_headers: v })} />
          </>
        );
      case "Buttons":
        return (
          <>
            <ColorRow label="Background" value={theme.buttons_background} onChange={(v) => update({ buttons_background: v })} />
            <ColorRow label="Foreground" value={theme.buttons_foreground} onChange={(v) => update({ buttons_foreground: v })} />
            <ColorRow label="Border" value={theme.buttons_border} onChange={(v) => update({ buttons_border: v })} />
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-zinc-300">Button Style</span>
              <button
                onClick={cycleButtonStyle}
                className="px-2.5 py-1 bg-zinc-800 border border-zinc-700/50 rounded text-[10px] text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {theme.button_style}
              </button>
            </div>
          </>
        );
      case "Forms":
        return (
          <>
            <ColorRow label="Background" value={theme.forms_background} onChange={(v) => update({ forms_background: v })} />
            <ColorRow label="Foreground" value={theme.forms_foreground} onChange={(v) => update({ forms_foreground: v })} />
            <ToggleRow label="Dark Top Bar" checked={theme.dark_top_bar} onChange={(v) => update({ dark_top_bar: v })} />
          </>
        );
      case "Text Boxes":
        return (
          <>
            <ColorRow label="Background" value={theme.textboxes_background} onChange={(v) => update({ textboxes_background: v })} />
            <ColorRow label="Foreground" value={theme.textboxes_foreground} onChange={(v) => update({ textboxes_foreground: v })} />
            <ColorRow label="Border" value={theme.textboxes_border} onChange={(v) => update({ textboxes_border: v })} />
          </>
        );
      case "Labels":
        return (
          <>
            <ColorRow label="Background" value={theme.label_background} onChange={(v) => update({ label_background: v })} />
            <ColorRow label="Foreground" value={theme.label_foreground} onChange={(v) => update({ label_foreground: v })} />
            <ToggleRow label="Transparent BG" checked={theme.label_transparent} onChange={(v) => update({ label_transparent: v })} />
          </>
        );
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${closing ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={handleClose}
    >
      <div
        className={`bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl w-[480px] h-[520px] flex flex-col overflow-hidden ${closing ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">Theme Editor</h2>
          <button onClick={handleClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[160px] shrink-0 border-r border-zinc-800/60 py-1 px-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  category === cat
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-1 px-5 py-3 overflow-y-auto">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">
              {category}
            </div>
            {renderControls()}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/60 shrink-0">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
