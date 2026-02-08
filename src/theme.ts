import type { ThemeData } from "./types";

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR_RE = /^rgba?\((.+)\)$/i;
const DEFAULT_ACCENT = "#38bdf8";

const LEGACY_V4_THEME: ThemeData = {
  accounts_background: "#09090B",
  accounts_foreground: "#E4E4E7",
  buttons_background: "#27272A",
  buttons_foreground: "#A1A1AA",
  buttons_border: "#3F3F46",
  forms_background: "#09090B",
  forms_foreground: "#E4E4E7",
  textboxes_background: "#18181B",
  textboxes_foreground: "#D4D4D8",
  textboxes_border: "#27272A",
  label_background: "#09090B",
  label_foreground: "#71717A",
  label_transparent: true,
  dark_top_bar: true,
  show_headers: true,
  light_images: false,
  button_style: "Flat",
};

const CATPPUCCIN_THEME: ThemeData = {
  accounts_background: "#1E1E2E",
  accounts_foreground: "#CDD6F4",
  buttons_background: "#313244",
  buttons_foreground: "#CDD6F4",
  buttons_border: "#45475A",
  forms_background: "#1E1E2E",
  forms_foreground: "#CDD6F4",
  textboxes_background: "#313244",
  textboxes_foreground: "#CDD6F4",
  textboxes_border: "#45475A",
  label_background: "#1E1E2E",
  label_foreground: "#CDD6F4",
  label_transparent: true,
  dark_top_bar: true,
  show_headers: true,
  light_images: false,
  button_style: "Flat",
};

export const DEFAULT_THEME: ThemeData = { ...LEGACY_V4_THEME };

export const THEME_PRESETS: Array<{ id: string; label: string; theme: ThemeData }> = [
  {
    id: "legacy-v4",
    label: "Legacy v4 (Original)",
    theme: { ...LEGACY_V4_THEME },
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    theme: { ...CATPPUCCIN_THEME },
  },
  {
    id: "graphite",
    label: "Graphite",
    theme: {
      ...LEGACY_V4_THEME,
      accounts_background: "#16181D",
      accounts_foreground: "#E6E8EE",
      buttons_background: "#23262E",
      buttons_foreground: "#F3F4F8",
      buttons_border: "#3B3F4B",
      forms_background: "#111318",
      forms_foreground: "#E2E5EC",
      textboxes_background: "#1F222A",
      textboxes_foreground: "#E6E8EE",
      textboxes_border: "#363A46",
      label_background: "#111318",
      label_foreground: "#A5ABB9",
      dark_top_bar: true,
      button_style: "Standard",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    theme: {
      ...LEGACY_V4_THEME,
      accounts_background: "#102334",
      accounts_foreground: "#D9EEFF",
      buttons_background: "#17405F",
      buttons_foreground: "#E8F5FF",
      buttons_border: "#2E6A91",
      forms_background: "#0B1A29",
      forms_foreground: "#D6EBFB",
      textboxes_background: "#17364D",
      textboxes_foreground: "#E3F2FF",
      textboxes_border: "#2B6285",
      label_background: "#0B1A29",
      label_foreground: "#8FB8D8",
      dark_top_bar: true,
      button_style: "Popup",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    theme: {
      ...LEGACY_V4_THEME,
      accounts_background: "#2C1324",
      accounts_foreground: "#FFE8F2",
      buttons_background: "#542448",
      buttons_foreground: "#FFEAF4",
      buttons_border: "#7A3E68",
      forms_background: "#1D0D1A",
      forms_foreground: "#FFE4F0",
      textboxes_background: "#4A2241",
      textboxes_foreground: "#FFEBF5",
      textboxes_border: "#70355F",
      label_background: "#1D0D1A",
      label_foreground: "#DFA4C7",
      dark_top_bar: true,
      button_style: "Popup",
    },
  },
];

function sanitizeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const next = value.trim();
  if (!next) {
    return fallback;
  }

  if (HEX_COLOR_RE.test(next) || RGB_COLOR_RE.test(next)) {
    return next;
  }

  return fallback;
}

function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function parseHexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }

  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }

  return null;
}

function parseRgb(value: string): [number, number, number] | null {
  const match = RGB_COLOR_RE.exec(value.trim());
  if (!match) {
    return null;
  }

  const parts = match[1]
    .split(",")
    .slice(0, 3)
    .map((part) => Number(part.trim()));

  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) {
    return null;
  }

  return [clampByte(parts[0]), clampByte(parts[1]), clampByte(parts[2])];
}

function colorToRgb(value: string, fallback: string): [number, number, number] {
  const fromHex = parseHexToRgb(value);
  if (fromHex) {
    return fromHex;
  }

  const fromRgb = parseRgb(value);
  if (fromRgb) {
    return fromRgb;
  }

  return parseHexToRgb(fallback) ?? [39, 39, 42];
}

function rgba(value: string, alpha: number, fallback = "#27272a") {
  const [r, g, b] = colorToRgb(value, fallback);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pickAccentColor(value: string) {
  const [r, g, b] = colorToRgb(value, DEFAULT_ACCENT);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 10) {
    return DEFAULT_ACCENT;
  }
  return value;
}

function normalizeButtonStyle(value: string): ThemeData["button_style"] {
  if (value === "Popup" || value === "Standard" || value === "Flat") {
    return value;
  }
  return "Flat";
}

export function normalizeTheme(theme: ThemeData | null | undefined): ThemeData {
  const source = theme ?? DEFAULT_THEME;

  return {
    accounts_background: sanitizeColor(source.accounts_background, DEFAULT_THEME.accounts_background),
    accounts_foreground: sanitizeColor(source.accounts_foreground, DEFAULT_THEME.accounts_foreground),
    buttons_background: sanitizeColor(source.buttons_background, DEFAULT_THEME.buttons_background),
    buttons_foreground: sanitizeColor(source.buttons_foreground, DEFAULT_THEME.buttons_foreground),
    buttons_border: sanitizeColor(source.buttons_border, DEFAULT_THEME.buttons_border),
    forms_background: sanitizeColor(source.forms_background, DEFAULT_THEME.forms_background),
    forms_foreground: sanitizeColor(source.forms_foreground, DEFAULT_THEME.forms_foreground),
    textboxes_background: sanitizeColor(source.textboxes_background, DEFAULT_THEME.textboxes_background),
    textboxes_foreground: sanitizeColor(source.textboxes_foreground, DEFAULT_THEME.textboxes_foreground),
    textboxes_border: sanitizeColor(source.textboxes_border, DEFAULT_THEME.textboxes_border),
    label_background: sanitizeColor(source.label_background, DEFAULT_THEME.label_background),
    label_foreground: sanitizeColor(source.label_foreground, DEFAULT_THEME.label_foreground),
    label_transparent: !!source.label_transparent,
    dark_top_bar: !!source.dark_top_bar,
    show_headers: !!source.show_headers,
    light_images: !!source.light_images,
    button_style: normalizeButtonStyle(source.button_style),
  };
}

export function applyThemeCssVariables(themeInput: ThemeData) {
  const t = normalizeTheme(themeInput);
  const accentBase = pickAccentColor(t.buttons_foreground);
  const root = document.documentElement;
  const style = root.style;

  style.setProperty("--accounts-bg", t.accounts_background);
  style.setProperty("--accounts-fg", t.accounts_foreground);
  style.setProperty("--buttons-bg", t.buttons_background);
  style.setProperty("--buttons-fg", t.buttons_foreground);
  style.setProperty("--buttons-bc", t.buttons_border);
  style.setProperty("--forms-bg", t.forms_background);
  style.setProperty("--forms-fg", t.forms_foreground);
  style.setProperty("--textboxes-bg", t.textboxes_background);
  style.setProperty("--textboxes-fg", t.textboxes_foreground);
  style.setProperty("--textboxes-bc", t.textboxes_border);
  style.setProperty("--labels-bg", t.label_transparent ? "transparent" : t.label_background);
  style.setProperty("--labels-fg", t.label_foreground);

  style.setProperty("--app-bg", t.forms_background);
  style.setProperty("--app-fg", t.forms_foreground);
  style.setProperty("--panel-bg", t.accounts_background);
  style.setProperty("--panel-fg", t.accounts_foreground);
  style.setProperty("--panel-muted", rgba(t.label_foreground, 0.85, DEFAULT_THEME.label_foreground));
  style.setProperty("--panel-soft", rgba(t.buttons_background, 0.55, DEFAULT_THEME.buttons_background));
  style.setProperty("--border-color", t.buttons_border);
  style.setProperty("--row-hover", rgba(t.buttons_background, 0.32, DEFAULT_THEME.buttons_background));
  style.setProperty("--row-selected", rgba(t.buttons_background, 0.62, DEFAULT_THEME.buttons_background));
  style.setProperty("--input-focus", rgba(accentBase, 0.22, DEFAULT_ACCENT));
  style.setProperty("--accent-color", accentBase);
  style.setProperty("--accent-soft", rgba(accentBase, 0.2, DEFAULT_ACCENT));
  style.setProperty("--accent-strong", rgba(accentBase, 0.38, DEFAULT_ACCENT));
  style.setProperty("--titlebar-bg", t.dark_top_bar ? "#09090b" : t.forms_background);
  style.setProperty("--titlebar-fg", t.dark_top_bar ? "#a1a1aa" : t.forms_foreground);
  style.setProperty("--avatar-filter", t.light_images ? "brightness(1.08) contrast(1.03) saturate(1.08)" : "none");

  const buttonStyle = normalizeButtonStyle(t.button_style);
  style.setProperty("--button-radius", buttonStyle === "Standard" ? "6px" : buttonStyle === "Popup" ? "10px" : "8px");
  style.setProperty(
    "--button-shadow",
    buttonStyle === "Popup" ? `0 8px 22px ${rgba(t.buttons_background, 0.45, DEFAULT_THEME.buttons_background)}` : "none"
  );
  style.setProperty(
    "--button-inset",
    buttonStyle === "Standard" ? `inset 0 1px 0 ${rgba(t.buttons_foreground, 0.2, DEFAULT_THEME.buttons_foreground)}` : "none"
  );

  root.dataset.buttonStyle = buttonStyle;
  root.dataset.showHeaders = t.show_headers ? "true" : "false";
}
