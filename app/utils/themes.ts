/**
 * UI Theme system — CSS custom-property driven.
 */

export interface Theme {
  id: string;
  name: string;
  icon: string;
  vars: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: "midnight",
    name: "Midnight",
    icon: "🌑",
    vars: {
      "--bg-base": "10 10 18",
      "--bg-surface": "18 18 30",
      "--bg-elevated": "26 26 42",
      "--bg-canvas": "6 6 14",
      "--border": "255 255 255 / 0.06",
      "--border-focus": "255 255 255 / 0.12",
      "--text-primary": "240 240 255",
      "--text-secondary": "160 160 190",
      "--text-muted": "100 100 130",
      "--accent": "220 60 90",
      "--accent-hover": "240 80 110",
      "--accent-glow": "220 60 90 / 0.15",
      "--shadow-color": "0 0 0 / 0.5",
      "--glass-bg": "18 18 30 / 0.7",
    },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    icon: "🖤",
    vars: {
      "--bg-base": "16 16 16",
      "--bg-surface": "24 24 24",
      "--bg-elevated": "34 34 34",
      "--bg-canvas": "8 8 8",
      "--border": "255 255 255 / 0.07",
      "--border-focus": "255 255 255 / 0.14",
      "--text-primary": "230 230 230",
      "--text-secondary": "155 155 155",
      "--text-muted": "95 95 95",
      "--accent": "160 120 255",
      "--accent-hover": "180 145 255",
      "--accent-glow": "160 120 255 / 0.15",
      "--shadow-color": "0 0 0 / 0.6",
      "--glass-bg": "24 24 24 / 0.7",
    },
  },
  {
    id: "snow",
    name: "Snow",
    icon: "☀️",
    vars: {
      "--bg-base": "245 245 248",
      "--bg-surface": "255 255 255",
      "--bg-elevated": "255 255 255",
      "--bg-canvas": "235 235 240",
      "--border": "0 0 0 / 0.08",
      "--border-focus": "0 0 0 / 0.15",
      "--text-primary": "25 25 35",
      "--text-secondary": "80 80 100",
      "--text-muted": "140 140 155",
      "--accent": "60 100 220",
      "--accent-hover": "80 120 240",
      "--accent-glow": "60 100 220 / 0.1",
      "--shadow-color": "0 0 0 / 0.08",
      "--glass-bg": "255 255 255 / 0.75",
    },
  },
  {
    id: "warm",
    name: "Warm",
    icon: "🌅",
    vars: {
      "--bg-base": "22 18 15",
      "--bg-surface": "32 26 22",
      "--bg-elevated": "42 34 28",
      "--bg-canvas": "14 11 9",
      "--border": "255 200 150 / 0.08",
      "--border-focus": "255 200 150 / 0.16",
      "--text-primary": "255 240 225",
      "--text-secondary": "190 170 150",
      "--text-muted": "120 105 90",
      "--accent": "240 140 50",
      "--accent-hover": "255 165 75",
      "--accent-glow": "240 140 50 / 0.15",
      "--shadow-color": "0 0 0 / 0.5",
      "--glass-bg": "32 26 22 / 0.7",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    icon: "🌊",
    vars: {
      "--bg-base": "8 16 24",
      "--bg-surface": "12 24 36",
      "--bg-elevated": "18 32 48",
      "--bg-canvas": "4 10 18",
      "--border": "100 180 255 / 0.08",
      "--border-focus": "100 180 255 / 0.16",
      "--text-primary": "220 240 255",
      "--text-secondary": "140 175 200",
      "--text-muted": "80 110 140",
      "--accent": "40 180 200",
      "--accent-hover": "60 210 230",
      "--accent-glow": "40 180 200 / 0.15",
      "--shadow-color": "0 0 0 / 0.5",
      "--glass-bg": "12 24 36 / 0.7",
    },
  },
];

let currentTheme: Theme = THEMES[0]!;

export function applyTheme(theme: Theme) {
  currentTheme = theme;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute("data-theme", theme.id);
  localStorage.setItem("cycloid-theme", theme.id);
}

export function loadSavedTheme(): Theme {
  const saved = localStorage.getItem("cycloid-theme");
  const theme = THEMES.find((t) => t.id === saved) ?? THEMES[0]!;
  applyTheme(theme);
  return theme;
}

export function getCurrentTheme(): Theme {
  return currentTheme;
}
