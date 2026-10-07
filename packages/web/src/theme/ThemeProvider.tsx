// Applies the theme by setting data-theme on <html>; the CSS tokens in index.css
// do the rest. The choice is saved in settings (the design doc's home for it)
// and mirrored to localStorage so index.html can apply it before React loads.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSettings, useUpdateSettings } from "../api/queries";

type Resolved = "light" | "dark";

// Read by the inline script in index.html; keep the two in sync.
export const THEME_STORAGE_KEY = "tix:theme";

const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");

interface ThemeContextValue {
  theme: Resolved;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [systemDark, setSystemDark] = useState(systemQuery.matches);

  // Follow the OS setting live while the preference is "system".
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    systemQuery.addEventListener("change", onChange);
    return () => systemQuery.removeEventListener("change", onChange);
  }, []);

  // Before settings load, trust what index.html already applied.
  const preference = settings?.theme ?? document.documentElement.dataset.theme ?? "system";
  const theme: Resolved =
    preference === "system" ? (systemDark ? "dark" : "light") : (preference as Resolved);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => {
    const next: Resolved = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; // instant, before the save finishes
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the setting still saves through the API.
    }
    updateSettings.mutate({ theme: next });
  };

  return <ThemeContext value={{ theme, toggle }}>{children}</ThemeContext>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
