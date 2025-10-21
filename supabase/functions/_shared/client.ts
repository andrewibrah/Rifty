import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { getEnv, requireEnv } from "./config.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

export const supabaseAdminClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export const PROJECT_URL = SUPABASE_URL;
export const SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
