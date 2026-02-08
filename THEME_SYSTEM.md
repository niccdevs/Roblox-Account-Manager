# Theme System (v4)

This repository now uses a centralized theme pipeline. If you change theme behavior, keep these files in sync.

## Source Of Truth

- Frontend default + presets: `src/theme.ts`
- Backend persisted defaults (for fresh installs / missing `RAMTheme.ini`): `src-tauri/src/data/settings.rs` (`impl Default for ThemeData`)
- Backend custom preset file (user-defined presets): `RAMThemePresets.json` in app runtime directory
- CSS boot-time fallback vars (before runtime theme applies): `src/index.css` (`:root`)

## Current Default

- Default theme is **Legacy v4 (Original)** to preserve the pre-refactor v4 look.
- Catppuccin and other styles are presets, not defaults.

## Editing Rules

1. If you change default theme colors:
- Update `DEFAULT_THEME` in `src/theme.ts`
- Update Rust `ThemeData::default()` in `src-tauri/src/data/settings.rs`
- Update `:root` CSS vars in `src/index.css` so startup flash matches

2. If you add/change presets:
- Edit `THEME_PRESETS` in `src/theme.ts`
- Keep preset IDs stable once used by UI state
- Built-in presets are in code; custom presets are file-backed and managed via Tauri commands

3. If you change theme application logic:
- Update `applyThemeCssVariables` in `src/theme.ts`
- Prefer CSS vars + utility classes (`theme-*`) over hardcoded `zinc/sky` classes

4. Theme editor behavior:
- Live preview: `store.applyThemePreview(...)`
- Persist save: `store.saveTheme(...)`
- Cancel/Escape should restore opening snapshot, not current draft
- Preset selection in the Theme Editor auto-applies immediately
- Custom preset operations are command-backed:
  - `get_theme_presets`
  - `save_theme_preset`
  - `delete_theme_preset`
  - `import_theme_preset_file`
  - `export_theme_preset_file`

## Practical Notes

- Accent variables are computed in `src/theme.ts` and may fallback to the legacy blue accent when the configured button foreground is near-grayscale.
- `show_headers` is enforced in UI via store logic and `data-show-headers` CSS dataset.
- `light_images` is applied via `--avatar-filter` + `theme-avatar`.
- Exported share files use `.ram-theme.json` and include `format`, `name`, and `theme`.
