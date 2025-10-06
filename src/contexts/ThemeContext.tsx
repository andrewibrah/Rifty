import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "light" | "dark";

interface ThemeContextType {
  themeMode: ThemeMode;
  toggleTheme: () => void;
  isDark: boolean;
  isSystemTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [isSystemTheme, setIsSystemTheme] = useState(true);

  useEffect(() => {
    // Load saved theme preference
    AsyncStorage.getItem("themeMode")
      .then((savedTheme) => {
        if (savedTheme && (savedTheme === "light" || savedTheme === "dark")) {
          setThemeMode(savedTheme);
          setIsSystemTheme(false);
        } else {
          // Use system theme if no preference saved
          const systemTheme = Appearance.getColorScheme();
          setThemeMode(systemTheme === "dark" ? "dark" : "light");
          setIsSystemTheme(true);
        }
      })
      .catch((error) => {
        console.warn("Failed to load theme preference:", error);
        // Fallback to system theme
        const systemTheme = Appearance.getColorScheme();
        setThemeMode(systemTheme === "dark" ? "dark" : "light");
        setIsSystemTheme(true);
      });

    // Listen for system theme changes
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (isSystemTheme) {
        setThemeMode(colorScheme === "dark" ? "dark" : "light");
      }
    });

    return () => subscription?.remove();
  }, [isSystemTheme]);

  const toggleTheme = () => {
    if (isSystemTheme) {
      // System Theme → Light Mode
      setThemeMode("light");
      setIsSystemTheme(false);
      AsyncStorage.setItem("themeMode", "light").catch((error) => {
        console.warn("Failed to save theme preference:", error);
      });
    } else if (themeMode === "light") {
      // Light Mode → Dark Mode
      setThemeMode("dark");
      setIsSystemTheme(false);
      AsyncStorage.setItem("themeMode", "dark").catch((error) => {
        console.warn("Failed to save theme preference:", error);
      });
    } else {
      // Dark Mode → System Theme
      const systemTheme = Appearance.getColorScheme();
      setThemeMode(systemTheme === "dark" ? "dark" : "light");
      setIsSystemTheme(true);
      AsyncStorage.removeItem("themeMode").catch((error) => {
        console.warn("Failed to clear theme preference:", error);
      });
    }
  };

  const value = {
    themeMode,
    toggleTheme,
    isDark: themeMode === "dark",
    isSystemTheme,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
