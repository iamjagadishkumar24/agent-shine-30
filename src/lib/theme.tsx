import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "purple" | "blue" | "green" | "orange" | "red" | "gold";
export type Density = "compact" | "cozy" | "comfy";

export interface ThemePreferences {
  mode: ThemeMode;
  accent: AccentColor;
  density: Density;
  sidebarCollapsed: boolean;
}

const DEFAULTS: ThemePreferences = {
  mode: "dark",
  accent: "purple",
  density: "cozy",
  sidebarCollapsed: false,
};

const STORAGE_KEY = "signal-qms-theme";

function readStored(): ThemePreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function applyTheme(prefs: ThemePreferences) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const resolvedMode =
    prefs.mode === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : prefs.mode;
  html.classList.toggle("light", resolvedMode === "light");
  html.classList.toggle("dark", resolvedMode === "dark");
  if (prefs.accent === "purple") html.removeAttribute("data-accent");
  else html.setAttribute("data-accent", prefs.accent);
  html.setAttribute("data-density", prefs.density);
}

interface Ctx {
  prefs: ThemePreferences;
  update: (patch: Partial<ThemePreferences>) => void;
  reset: () => void;
}

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePreferences>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = readStored();
    setPrefs(p);
    applyTheme(p);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyTheme(prefs);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs, ready]);

  useEffect(() => {
    if (prefs.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme(prefs);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs]);

  const value: Ctx = {
    prefs,
    update: (patch) => setPrefs((p) => ({ ...p, ...patch })),
    reset: () => setPrefs(DEFAULTS),
  };

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
