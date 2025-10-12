import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { EntryType } from "../services/data";

export interface ClassifiedEntry {
  id: string;
  user_id: string;
  type: EntryType;
  content: string;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at?: string;
  ai_intent: string | null;
  ai_confidence: number | null;
  ai_meta: Record<string, any> | null;
  source: string | null;
}

const getExtra = () =>
  (Constants.expoConfig?.extra ?? {}) as Record<string, any>;

function getSupabaseUrl(): string {
  const extra = getExtra();
  const url =
    extra.SUPABASE_URL ??
    extra.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    "";
  if (!url) {
    throw new Error("Missing Supabase URL configuration");
  }
  return url;
}

function getAnonKey(): string {
  const extra = getExtra();
  const key =
    extra.SUPABASE_ANON_KEY ??
    extra.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  if (!key) {
    throw new Error("Missing Supabase anon key configuration");
  }
  return key;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  const accessToken = data.session?.access_token ?? null;
  if (!accessToken) {
    throw new Error("No active session");
  }
  return accessToken;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) {
      return body.error;
    }
    return "Request failed";
  } catch (_error) {
    return "Request failed";
  }
}

export async function createEntryFromChat(
  content: string
): Promise<ClassifiedEntry> {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("Content is required");
  }

  const [url, anonKey, accessToken] = await Promise.all([
    Promise.resolve(getSupabaseUrl()),
    Promise.resolve(getAnonKey()),
    getAccessToken(),
  ]);

  const response = await fetch(
    `${url}/functions/v1/classify_and_create_entry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ content: trimmedContent }),
    }
  );

  if (!response.ok) {
    const message = await parseError(response);
    throw new Error(message);
  }

  const data = (await response.json()) as ClassifiedEntry;
  return data;
}
