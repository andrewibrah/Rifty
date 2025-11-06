import { Platform } from "react-native";
import { ThemeMode } from "../contexts/ThemeContext";

const darkColors = {
  // Modern glass theme
  background: "#0A0A0B",
  surface: "rgba(255, 255, 255, 0.05)",
  surfaceElevated: "rgba(255, 255, 255, 0.08)",
  surfaceGlass: "rgba(255, 255, 255, 0.1)",

  // Text colors
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.7)",
  textTertiary: "rgba(255, 255, 255, 0.5)",

  // Accent colors
  accent: "#6366F1", // Modern indigo
  accentLight: "#818CF8",
  accentDark: "#4F46E5",

  // Glass borders
  border: "rgba(255, 255, 255, 0.1)",
  borderLight: "rgba(255, 255, 255, 0.05)",

  // Status colors
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
};

const lightColors = {
  // Light theme
  background: "#FFFFFF",
  surface: "rgba(0, 0, 0, 0.05)",
  surfaceElevated: "rgba(0, 0, 0, 0.08)",
  surfaceGlass: "rgba(0, 0, 0, 0.1)",

  // Text colors
  textPrimary: "#000000",
  textSecondary: "rgba(0, 0, 0, 0.7)",
  textTertiary: "rgba(0, 0, 0, 0.5)",

  // Accent colors
  accent: "#6366F1", // Modern indigo
  accentLight: "#818CF8",
  accentDark: "#4F46E5",

  // Glass borders
  border: "rgba(0, 0, 0, 0.1)",
  borderLight: "rgba(0, 0, 0, 0.05)",

  // Status colors
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
};

export const getColors = (themeMode: ThemeMode = 'dark') => {
  return themeMode === 'dark' ? darkColors : lightColors;
};

export type ColorScheme = ReturnType<typeof getColors>;

// Default export for backward compatibility
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
};

export const typography = {
  // Modern thick typography
  display: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    fontWeight: "900" as const,
    letterSpacing: -0.5,
    lineHeight: 1.1,
  },
  heading: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    fontWeight: "800" as const,
    letterSpacing: -0.25,
    lineHeight: 1.2,
  },
  title: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    fontWeight: "700" as const,
    letterSpacing: 0,
    lineHeight: 1.3,
  },
  body: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "Roboto",
    fontWeight: "500" as const,
    letterSpacing: 0,
    lineHeight: 1.4,
  },
  bodyLight: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "Roboto",
    fontWeight: "400" as const,
    letterSpacing: 0,
    lineHeight: 1.4,
  },
  button: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    fontWeight: "600" as const,
    letterSpacing: 0.25,
    lineHeight: 1.2,
  },
  caption: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "Roboto",
    fontWeight: "500" as const,
    letterSpacing: 0.25,
    lineHeight: 1.3,
  },
  small: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "Roboto",
    fontWeight: "500" as const,
    letterSpacing: 0.25,
    lineHeight: 1.25,
  },
  h1: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    fontWeight: "900" as const,
    letterSpacing: -0.5,
    lineHeight: 1.15,
  },
  h2: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    fontWeight: "800" as const,
    letterSpacing: -0.35,
    lineHeight: 1.2,
  },
  h3: {
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    fontWeight: "700" as const,
    letterSpacing: -0.2,
    lineHeight: 1.25,
  },
};

export const shadows = {
  glass: {
    shadowColor: "rgba(0, 0, 0, 0.1)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  glassElevated: {
    shadowColor: "rgba(0, 0, 0, 0.15)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
  },
  glow: {
    shadowColor: "rgba(99, 102, 241, 0.3)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
};
