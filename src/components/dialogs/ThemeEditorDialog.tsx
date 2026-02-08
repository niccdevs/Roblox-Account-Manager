import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { useModalClose } from "../../hooks/useModalClose";
import { useConfirm, usePrompt } from "../../hooks/usePrompt";
import type { ThemeData } from "../../types";
import { ColorRow } from "../ui/ColorRow";
import { ToggleRow } from "../ui/ToggleRow";
import { DEFAULT_THEME, THEME_PRESETS, normalizeTheme } from "../../theme";

type Category = "Accounts" | "Buttons" | "Forms" | "Text Boxes" | "Labels";
type PresetSource = "builtin" | "custom";

interface CustomThemePreset {
  id: string;
  name: string;
  theme: ThemeData;
}

interface PresetOption {
  key: string;
  source: PresetSource;
  label: string;
  theme: ThemeData;
  customId?: string;
}

const CATEGORIES: Category[] = ["Accounts", "Buttons", "Forms", "Text Boxes", "Labels"];
const BUILTIN_PREFIX = "builtin:";
const CUSTOM_PREFIX = "custom:";

function sortCustomPresets(presets: CustomThemePreset[]) {
  return [...presets].sort((a, b) => a.name.localeCompare(b.name));
}

function upsertCustomPreset(prev: CustomThemePreset[], next: CustomThemePreset) {
  const filtered = prev.filter((p) => p.id !== next.id);
  return sortCustomPresets([...filtered, next]);
}

function cleanPresetLabel(label: string) {
  return label.replace(/\s+\(Custom\)$/, "");
}

export function ThemeEditorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const { visible, closing, handleClose } = useModalClose(open, onClose);
  const [category, setCategory] = useState<Category>("Accounts");
  const [theme, setThemeLocal] = useState<ThemeData>({ ...DEFAULT_THEME });
  const [savedTheme, setSavedTheme] = useState<ThemeData>({ ...DEFAULT_THEME });
  const [customPresets, setCustomPresets] = useState<CustomThemePreset[]>([]);
  const [presetId, setPresetId] = useState(`${BUILTIN_PREFIX}${THEME_PRESETS[0].id}`);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const openThemeRef = useRef<ThemeData>({ ...DEFAULT_THEME });
  const presetMenuRef = useRef<HTMLDivElement>(null);

  const presetOptions = useMemo<PresetOption[]>(() => {
    const builtIn = THEME_PRESETS.map((preset) => ({
      key: `${BUILTIN_PREFIX}${preset.id}`,
      source: "builtin" as const,
      label: preset.label,
      theme: preset.theme,
    }));
    const custom = customPresets.map((preset) => ({
      key: `${CUSTOM_PREFIX}${preset.id}`,
      source: "custom" as const,
      label: `${preset.name} (Custom)`,
      theme: preset.theme,
      customId: preset.id,
    }));
    return [...builtIn, ...custom];
  }, [customPresets]);

  const selectedPreset = useMemo(
    () => presetOptions.find((preset) => preset.key === presetId) ?? null,
    [presetOptions, presetId]
  );
  const builtInPresetOptions = useMemo(
    () => presetOptions.filter((preset) => preset.source === "builtin"),
    [presetOptions]
  );
  const customPresetOptions = useMemo(
    () => presetOptions.filter((preset) => preset.source === "custom"),
    [presetOptions]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const nextTheme = normalizeTheme(store.theme ?? DEFAULT_THEME);
    openThemeRef.current = nextTheme;
    setThemeLocal(nextTheme);
    setSavedTheme(nextTheme);
    store.applyThemePreview(nextTheme);
    invoke<CustomThemePreset[]>("get_theme_presets")
      .then((presets) => {
        if (cancelled) return;
        setCustomPresets(sortCustomPresets(presets));
      })
      .catch(() => {
        if (cancelled) return;
        setCustomPresets([]);
      });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        store.applyThemePreview(openThemeRef.current);
        handleClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPresetMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!presetMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (!presetMenuRef.current) return;
      if (!presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [presetMenuOpen]);

  useEffect(() => {
    if (presetOptions.some((preset) => preset.key === presetId)) return;
    const fallback = presetOptions[0]?.key ?? "";
    if (fallback) {
      setPresetId(fallback);
    }
  }, [presetOptions, presetId]);

  const applyLive = useCallback(
    (updated: ThemeData) => {
      store.applyThemePreview(updated);
    },
    [store.applyThemePreview]
  );

  if (!visible) return null;

  function update(partial: Partial<ThemeData>) {
    setThemeLocal((prev) => {
      const next = { ...prev, ...partial };
      applyLive(next);
      return next;
    });
  }

  function handleCancel() {
    store.applyThemePreview(savedTheme ?? openThemeRef.current);
    handleClose();
  }

  async function handleSave() {
    try {
      const normalized = normalizeTheme(theme);
      await store.saveTheme(normalized);
      setSavedTheme(normalized);
      store.addToast("Theme saved");
      handleClose();
    } catch (e) {
      store.addToast(`Error: ${e}`);
    }
  }

  function handleReset() {
    const defaults = normalizeTheme(DEFAULT_THEME);
    setThemeLocal(defaults);
    applyLive(defaults);
  }

  function applyPresetByKey(key: string) {
    const selected = presetOptions.find((preset) => preset.key === key);
    if (!selected) return;
    const next = normalizeTheme(selected.theme);
    setThemeLocal(next);
    applyLive(next);
  }

  function handlePresetSelection(nextKey: string) {
    setPresetId(nextKey);
    applyPresetByKey(nextKey);
    setPresetMenuOpen(false);
  }

  async function handleSavePreset() {
    const suggestedName = cleanPresetLabel(selectedPreset?.label || "My Preset");
    const name = await prompt("Preset name:", suggestedName);
    if (!name?.trim()) return;
    try {
      const preset = await invoke<CustomThemePreset>("save_theme_preset", {
        name: name.trim(),
        theme: normalizeTheme(theme),
      });
      setCustomPresets((prev) => upsertCustomPreset(prev, preset));
      setPresetId(`${CUSTOM_PREFIX}${preset.id}`);
      store.addToast(`Preset saved: ${preset.name}`);
    } catch (e) {
      store.addToast(`Error: ${e}`);
    }
  }

  async function handleDeletePreset() {
    if (!selectedPreset?.customId) return;
    const name = cleanPresetLabel(selectedPreset.label);
    const ok = await confirm(`Delete preset "${name}"?`, true);
    if (!ok) return;
    try {
      await invoke("delete_theme_preset", { presetId: selectedPreset.customId });
      setCustomPresets((prev) => prev.filter((preset) => preset.id !== selectedPreset.customId));
      setPresetId(`${BUILTIN_PREFIX}${THEME_PRESETS[0].id}`);
      store.addToast(`Preset deleted: ${name}`);
    } catch (e) {
      store.addToast(`Error: ${e}`);
    }
  }

  async function handleImportPresetFile() {
    const path = await prompt("Preset file path (.json or .ram-theme.json):");
    if (!path?.trim()) return;
    try {
      const preset = await invoke<CustomThemePreset>("import_theme_preset_file", {
        path: path.trim(),
      });
      setCustomPresets((prev) => upsertCustomPreset(prev, preset));
      const key = `${CUSTOM_PREFIX}${preset.id}`;
      setPresetId(key);
      const next = normalizeTheme(preset.theme);
      setThemeLocal(next);
      applyLive(next);
      store.addToast(`Imported preset: ${preset.name}`);
    } catch (e) {
      store.addToast(`Error: ${e}`);
    }
  }

  async function handleExportPresetFile() {
    const suggestedName = cleanPresetLabel(selectedPreset?.label || "theme-preset");
    const name = await prompt("Export file name (no extension):", suggestedName);
    if (name === null) return;
    const exportName = name.trim() || suggestedName;
    try {
      const path = await invoke<string>("export_theme_preset_file", {
        name: exportName,
        theme: normalizeTheme(theme),
      });
      store.addToast(`Exported preset to ${path}`);
    } catch (e) {
      store.addToast(`Error: ${e}`);
    }
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
            <ToggleRow label="Light Avatars" checked={theme.light_images} onChange={(v) => update({ light_images: v })} />
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
              <span className="text-xs text-[var(--panel-fg)]">Button Style</span>
              <button
                onClick={cycleButtonStyle}
                className="theme-btn px-2.5 py-1 rounded text-[10px]"
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
      onClick={handleCancel}
    >
      <div
        className={`theme-modal-scope theme-panel theme-border rounded-2xl shadow-2xl w-[560px] h-[560px] flex flex-col overflow-hidden ${closing ? "animate-scale-out" : "animate-scale-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <h2 className="text-sm font-semibold text-[var(--panel-fg)]">Theme Editor</h2>
          <button onClick={handleCancel} className="theme-muted hover:opacity-100 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-3 border-b theme-border shrink-0">
          <div className="grid grid-cols-1 gap-2">
            <div ref={presetMenuRef} className="relative">
              <button
                onClick={() => setPresetMenuOpen((prev) => !prev)}
                className="theme-input w-full px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all duration-150 hover:brightness-110"
                aria-haspopup="listbox"
                aria-expanded={presetMenuOpen}
              >
                <span className="truncate text-[var(--panel-fg)]">
                  {cleanPresetLabel(selectedPreset?.label ?? "Select preset")}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`theme-muted transition-transform duration-150 ${presetMenuOpen ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div
                className={`absolute left-0 right-0 top-full mt-2 z-30 transition-all duration-150 origin-top ${
                  presetMenuOpen
                    ? "opacity-100 scale-100 pointer-events-auto"
                    : "opacity-0 scale-95 pointer-events-none"
                }`}
              >
                <div className="theme-panel theme-border border rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1.5">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide theme-muted font-semibold">Built-in</div>
                  {builtInPresetOptions.map((preset) => {
                    const active = preset.key === presetId;
                    return (
                      <button
                        key={preset.key}
                        onClick={() => handlePresetSelection(preset.key)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs border transition-all duration-150 ${
                          active
                            ? "theme-accent theme-accent-bg theme-accent-border"
                            : "border-transparent text-[var(--panel-fg)] hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                  <div className="mx-2 my-1 border-t theme-border" />
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide theme-muted font-semibold">Custom</div>
                  {customPresetOptions.length > 0 ? (
                    customPresetOptions.map((preset) => {
                      const active = preset.key === presetId;
                      return (
                        <button
                          key={preset.key}
                          onClick={() => handlePresetSelection(preset.key)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs border transition-all duration-150 ${
                            active
                              ? "theme-accent theme-accent-bg theme-accent-border"
                              : "border-transparent text-[var(--panel-fg)] hover:bg-[var(--panel-soft)]"
                          }`}
                        >
                          {cleanPresetLabel(preset.label)}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-2.5 py-2 text-[11px] theme-muted">No custom presets yet</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSavePreset}
                className="theme-btn px-3 py-1.5 text-xs font-medium"
              >
                Save Preset
              </button>
              <button
                onClick={handleImportPresetFile}
                className="theme-btn px-3 py-1.5 text-xs font-medium"
              >
                Import File
              </button>
              <button
                onClick={handleExportPresetFile}
                className="theme-btn px-3 py-1.5 text-xs font-medium"
              >
                Export File
              </button>
              <button
                onClick={handleDeletePreset}
                disabled={!selectedPreset?.customId}
                className="theme-btn px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete Preset
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[170px] shrink-0 border-r theme-border py-1 px-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  category === cat
                    ? "theme-btn"
                    : "theme-muted hover:opacity-100 hover:bg-[var(--panel-soft)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-1 px-5 py-3 overflow-y-auto">
            <div className="text-[10px] font-semibold uppercase tracking-wider theme-muted mb-3">
              {category}
            </div>
            {renderControls()}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t theme-border shrink-0">
          <button
            onClick={handleReset}
            className="theme-btn px-3 py-1.5 text-xs"
          >
            Reset to Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="theme-btn px-4 py-1.5 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="theme-btn px-4 py-1.5 text-xs font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
