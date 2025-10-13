import type { ExpoConfig } from "expo/config";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const envFiles = [".env.local", ".env"];
for (const fileName of envFiles) {
  const fullPath = path.resolve(__dirname, fileName);
  if (fs.existsSync(fullPath)) {
    loadEnv({ path: fullPath, override: false });
  }
}

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";
const MIGRATION_FLAG =
  (process.env.MIGRATION_2025_10_REMOVE_LOCAL_DB ?? "false")
    .toLowerCase()
    .trim() === "true";

const config: ExpoConfig = {
  name: "riflett",
  slug: "riflett",
  scheme: "riflett",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/logo.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "ai.reflectify.mobile",
    supportsTablet: false,
  },
  splash: {
    image: "./assets/logo.png",
    resizeMode: "contain",
    backgroundColor: "#0A0A0B",
  },
  extra: {
    EXPO_PUBLIC_OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    MIGRATION_2025_10_REMOVE_LOCAL_DB: MIGRATION_FLAG,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/logo.png",
      backgroundColor: "#0A0A0B",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/logo.png",
  },
  plugins: [],
};

export default config;
