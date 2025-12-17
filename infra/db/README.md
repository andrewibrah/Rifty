# Database Assets

Supabase schema snapshots and migrations live under this directory. The original `supabase/migrations` path now symlinks to `infra/db/supabase/migrations` so existing Supabase CLI workflows continue to work.

Contents:
- `supabase.sql`, `supabase_current_schema.sql`, `create_missing_tables.sql`, `refresh_mv.sql`, and `supabase.txt` for schema snapshots.
- `supabase/migrations` for incremental Supabase migrations.
- `SUPABASE_DATABASE_CALLS.md` and `SUPABASE_SECRETS_GUIDE.md` for operational notes.
