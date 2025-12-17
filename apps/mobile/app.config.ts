import type { ExpoConfig } from "expo/config";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const projectRoot = path.resolve(__dirname, "..", "..");
const envFiles = [
  path.resolve(__dirname, ".env.local"),
  path.resolve(__dirname, ".env"),
  path.join(projectRoot, ".env.local"),
  path.join(projectRoot, ".env"),
];

envFiles
  .filter((filePath, index, all) => all.indexOf(filePath) === index)
  .forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      loadEnv({ path: filePath, override: false });
    }
  });

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error(
    "SUPABASE_URL is required. Set EXPO_PUBLIC_SUPABASE_URL or SUPABASE_URL in your environment."
  );
}

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "SUPABASE_ANON_KEY is required. Set EXPO_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY in your environment."
  );
}
const FEATURE_MAINCHAT_REBRAND =
  (process.env.EXPO_PUBLIC_FEATURE_MAINCHAT_REBRAND ??
    process.env.FEATURE_MAINCHAT_REBRAND ??
    "false")
    .toLowerCase()
    .trim() === "true";
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
    FEATURE_MAINCHAT_REBRAND,
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
