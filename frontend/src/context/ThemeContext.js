import React, { createContext, useContext, useState, useEffect } from "react";
import { Appearance, Platform } from "react-native";

const storage = Platform.OS === "web"
  ? {
      getItemAsync: (k) => Promise.resolve(localStorage.getItem(k)),
      setItemAsync: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
    }
  : require("expo-secure-store");

const ThemeContext = createContext(null);

export const lightTheme = {
  bg: "#F0F2F8",
  surface: "#FFFFFF",
  surfaceHover: "#EEF0F6",
  border: "rgba(0,0,0,0.1)",
  textPrimary: "#0F1218",
  textSecondary: "#56607A",
  textMuted: "#909AAD",
  accent: "#7C6FFF",
  teal: "#00CFA8",
  danger: "#FF5260",
  amber: "#F59E0B"
};

export const darkTheme = {
  bg: "#0A0C12",
  surface: "#111420",
  surfaceHover: "#232840",
  border: "rgba(255,255,255,0.1)",
  textPrimary: "#EEF0FF",
  textSecondary: "#8890AA",
  textMuted: "#525C70",
  accent: "#7C6FFF",
  teal: "#00CFA8",
  danger: "#FF5260",
  amber: "#F59E0B"
};

export function ThemeProvider({ children }) {
  const [themeMode, setThemeMode] = useState("dark");

  useEffect(() => {
    storage.getItemAsync("np_theme").then(saved => {
      if (saved) setThemeMode(saved);
      else {
        const colorScheme = Appearance.getColorScheme();
        if (colorScheme === "light") setThemeMode("light");
      }
    });
  }, []);

  const toggleTheme = () => {
    setThemeMode(prev => {
      const next = prev === "light" ? "dark" : "light";
      storage.setItemAsync("np_theme", next).catch(() => {});
      return next;
    });
  };

  const colors = themeMode === "light" ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider value={{ theme: themeMode, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
