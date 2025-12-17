export const SUPABASE_TABLE_MISSING_CODE = "PGRST205" as const;

type SupabaseError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export function isTableMissingError(error: unknown): error is SupabaseError {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as SupabaseError).code;
  return code === SUPABASE_TABLE_MISSING_CODE;
}

export function debugIfTableMissing(
  label: string,
  error: unknown
): boolean {
  if (isTableMissingError(error)) {
    console.debug(`${label} skipped: table or view unavailable`, error);
    return true;
  }
  return false;
}
