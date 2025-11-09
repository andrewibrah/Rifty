# Supabase Secrets Management Guide

## Current Setup Analysis

### ✅ **Client-Side (Correct)**

- **Location**: `src/lib/supabase.ts`
- **Uses**: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **Why it's OK**: The anon key is **designed to be public**. It's safe to include in client code because:
  - It's protected by Row Level Security (RLS) policies
  - It can only do what your RLS policies allow
  - It's meant to be exposed in client applications

### ⚠️ **Edge Functions (Needs Improvement)**

- **Location**: `supabase/functions/*/index.ts`
- **Currently Uses**: Environment variables (`SERVICE_ROLE_KEY`, `PROJECT_URL`, `OPENAI_API_KEY`)
- **Problem**: Service role key should NEVER be in `.env` files or committed to git
- **Solution**: Use Supabase Secrets Management

---

## How to Use Supabase Secrets for Edge Functions

### 1. Set Secrets Using Supabase CLI

```bash
# Set secrets for your Supabase project
supabase secrets set SERVICE_ROLE_KEY=your_service_role_key_here
supabase secrets set PROJECT_URL=https://your-project.supabase.co
supabase secrets set OPENAI_API_KEY=your_openai_key_here
# JWT alignment
supabase secrets set AUTH_JWT_ISSUER=https://your-project.supabase.co/auth/v1
supabase secrets set AUTH_JWT_AUDIENCE=authenticated
supabase secrets set AUTH_JWT_ALLOWED_CLOCK_SKEW_SECONDS=120
```

### 2. Access Secrets in Edge Functions

Supabase automatically injects secrets as environment variables. Your edge functions already use the correct pattern:

```typescript
// In supabase/functions/process_entry_mvp/index.ts
const SUPABASE_URL = getEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SERVICE_ROLE_KEY");
const OPENAI_API_KEY = getEnv("OPENAI_API_KEY");
```

**Note**: Supabase automatically provides:

- `PROJECT_URL` - Your Supabase project URL
- `SERVICE_ROLE_KEY` - Service role key (automatically available)
- Any secrets you set via `supabase secrets set`

### 3. Local Development

For local development with `supabase start`, secrets are managed differently:

```bash
# Local development - secrets are in .env.local (not committed)
# For production, use: supabase secrets set
```

---

## Recommended Setup

### For Client Code (Keep as-is)

```typescript
// src/lib/supabase.ts
// ✅ Keep using environment variables for anon key
const configuredSupabaseAnonKey = pickEnvValue(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY
  // ...
);
```

### For Edge Functions (Use Supabase Secrets)

```typescript
// supabase/functions/*/index.ts
// ✅ Already correct - reads from Supabase secrets
const SERVICE_ROLE_KEY = getEnv("SERVICE_ROLE_KEY");
```

---

## Security Best Practices

### ✅ DO:

1. **Client code**: Use anon key from environment variables (safe to expose)
2. **Edge functions**: Use Supabase secrets management (`supabase secrets set`)
3. **Local dev**: Use `.env.local` (gitignored) for local Supabase instance
4. **Production**: Never commit service role keys to git

### ❌ DON'T:

1. **Never** put `SERVICE_ROLE_KEY` in committed `.env` files
2. **Never** expose service role key in client code
3. **Never** commit `.env` files with secrets to git

---

## Migration Steps

1. **Remove service role key from `.env` files**:

   ```bash
   # Remove these lines from .env and .env.local
   # SUPABASE_SERVICE_ROLE_KEY=...
   ```

2. **Set secrets in Supabase**:

   ```bash
   supabase secrets set SERVICE_ROLE_KEY=your_key
   supabase secrets set OPENAI_API_KEY=your_key
   ```

3. **Verify secrets are set**:

   ```bash
   supabase secrets list
   ```

4. **Test edge functions**:
   ```bash
   supabase functions serve process_entry_mvp
   ```

---

## Current Status

- ✅ Client code correctly uses anon key
- ✅ Edge functions correctly read from environment
- ⚠️ Need to migrate from `.env` to `supabase secrets set` for production
- ✅ `.env` files should be gitignored (verify this)

---

## Quick Reference

```bash
# Set a secret
supabase secrets set KEY_NAME=value

# List all secrets
supabase secrets list

# Unset a secret
supabase secrets unset KEY_NAME

# For local development
supabase start  # Uses .env.local automatically
```

---

## Why This Matters

- **Service Role Key** bypasses RLS and has full database access
- If exposed, attackers could read/write all data
- Supabase secrets are encrypted and only available to edge functions
- Never accessible to client code
