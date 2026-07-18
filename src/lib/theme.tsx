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

const MODES: readonly ThemeMode[] = ["light", "dark", "system"];
const ACCENTS: readonly AccentColor[] = ["purple", "blue", "green", "orange", "red", "gold"];
const DENSITIES: readonly Density[] = ["compact", "cozy", "comfy"];

function sanitize(raw: unknown): ThemePreferences {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemePreferences>;
  return {
    mode: MODES.includes(src.mode as ThemeMode) ? (src.mode as ThemeMode) : DEFAULTS.mode,
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
  const resolvedMode =
    prefs.mode === "system"
      ? typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: light)").matches
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
    } catch {
      /* quota exceeded or storage disabled — ignore */
    }
  }, [prefs, ready]);

  useEffect(() => {
    if (prefs.mode !== "system") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme(prefs);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
    } else if (typeof (mq as MediaQueryList & { addListener?: (l: () => void) => void }).addListener === "function") {
      (mq as MediaQueryList & { addListener: (l: () => void) => void }).addListener(onChange);
    }
    return () => {
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener("change", onChange);
      } else if (
        typeof (mq as MediaQueryList & { removeListener?: (l: () => void) => void }).removeListener === "function"
      ) {
        (mq as MediaQueryList & { removeListener: (l: () => void) => void }).removeListener(onChange);
      }
    };
  }, [prefs]);

  // Cross-tab sync: if the user changes the theme in another tab, mirror it here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = sanitize(JSON.parse(e.newValue));
        setPrefs(next);
      } catch {
        /* ignore malformed payload */
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
