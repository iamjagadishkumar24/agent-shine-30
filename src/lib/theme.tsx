import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Dark mode has been removed. Light theme only.
export type ThemeMode = "light";
export type AccentColor = "purple" | "blue" | "green" | "orange" | "red" | "gold";
export type Density = "compact" | "cozy" | "comfy";

export interface ThemePreferences {
  mode: ThemeMode;
  accent: AccentColor;
  density: Density;
  sidebarCollapsed: boolean;
}

const DEFAULTS: ThemePreferences = {
  mode: "light",
  accent: "blue",
  density: "cozy",
  sidebarCollapsed: false,
};

const STORAGE_KEY = "signal-qms-theme";
const ACCENTS: readonly AccentColor[] = ["purple", "blue", "green", "orange", "red", "gold"];
const DENSITIES: readonly Density[] = ["compact", "cozy", "comfy"];

function sanitize(raw: unknown): ThemePreferences {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemePreferences>;
  return {
    mode: "light",
    accent: ACCENTS.includes(src.accent as AccentColor) ? (src.accent as AccentColor) : DEFAULTS.accent,
    density: DENSITIES.includes(src.density as Density) ? (src.density as Density) : DEFAULTS.density,
    sidebarCollapsed: typeof src.sidebarCollapsed === "boolean" ? src.sidebarCollapsed : DEFAULTS.sidebarCollapsed,
  };
}

function readStored(): ThemePreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

function applyTheme(prefs: ThemePreferences) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.add("light");
  html.classList.remove("dark");
  html.setAttribute("data-theme", "light");
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
    } catch {
      /* ignore */
    }
  }, [prefs, ready]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setPrefs(sanitize(JSON.parse(e.newValue)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value: Ctx = {
    prefs,
    update: (patch) => setPrefs((p) => sanitize({ ...p, ...patch })),
    reset: () => setPrefs(DEFAULTS),
  };

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
