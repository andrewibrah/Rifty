import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { getEnv, requireEnv } from "./config.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
export const supabaseAdminClient = createClient(
  SUPABASE_URL,
  requireEnv("SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);
