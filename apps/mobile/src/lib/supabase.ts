import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

type ExtraRecord = Record<string, unknown>;

const resolveExtra = (): ExtraRecord => {
  const configExtra =
    (Constants.expoConfig?.extra as ExtraRecord | undefined) ?? {};
  const manifestExtra =
    (Constants.manifest2 as { extra?: ExtraRecord } | null)?.extra ?? {};
  return { ...manifestExtra, ...configExtra };
};

const readExtraString = (key: string): string | undefined => {
  const extra = resolveExtra();
  const value = extra[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const pickEnvValue = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const configuredSupabaseUrl = pickEnvValue(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_URL,
  readExtraString("EXPO_PUBLIC_SUPABASE_URL"),
  readExtraString("SUPABASE_URL")
);

const configuredSupabaseAnonKey = pickEnvValue(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY,
  readExtraString("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
  readExtraString("SUPABASE_ANON_KEY")
);

const environmentFlag = pickEnvValue(
  readExtraString("APP_ENV"),
  readExtraString("NODE_ENV"),
  process.env.APP_ENV,
  process.env.NODE_ENV
)?.toLowerCase();

const isDevEnvironment = (() => {
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as Record<string, unknown>).__DEV__ === "boolean"
  ) {
    return Boolean((globalThis as Record<string, unknown>).__DEV__);
  }

  if (environmentFlag) {
    return ["development", "dev"].includes(environmentFlag);
  }

  return false;
})();

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON_KEY = "anon-key";

let resolvedSupabaseUrl = configuredSupabaseUrl;
let resolvedSupabaseAnonKey = configuredSupabaseAnonKey;

if ((!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) && isDevEnvironment) {
  resolvedSupabaseUrl = resolvedSupabaseUrl ?? LOCAL_SUPABASE_URL;
  resolvedSupabaseAnonKey = resolvedSupabaseAnonKey ?? LOCAL_SUPABASE_ANON_KEY;
  console.warn(
    "[supabase] Missing configuration, using local Supabase fallback at http://127.0.0.1:54321. " +
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to silence this message."
  );
}

if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) {
  throw new Error(
    "Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(
  resolvedSupabaseUrl,
  resolvedSupabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: AsyncStorage,
      storageKey: "riflett.supabase.auth",
    },
  }
);

export const SUPABASE_URL = resolvedSupabaseUrl;
export const SUPABASE_ANON_KEY = resolvedSupabaseAnonKey;
