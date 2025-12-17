# Edge Functions Deployment Guide

## New Edge Functions Created

✅ **High Priority Functions:**

1. `get_operating_picture` - Multi-table memory aggregation
2. `rag_search` - Vector similarity search across entries/goals/schedules
3. `create_goal` - Goal creation with embedding generation & deduplication
4. `analyst_query` - RAG-powered Q&A with OpenAI

## Prerequisites

1. **Supabase CLI installed:**

   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**

   ```bash
   supabase login
   ```

3. **Link to your project:**
   ```bash
   supabase link --project-ref ajqcprzxaywgdtsveewq
   ```

## Step 1: Set Secrets

Before deploying, ensure all secrets are set:

```bash
# OpenAI API Key (required for embeddings and analyst queries)
supabase secrets set OPENAI_API_KEY=your_openai_key_here

# Optional: Set embedding model (defaults to text-embedding-3-small)
supabase secrets set EMBEDDING_MODEL=text-embedding-3-small

# Optional: Set OpenAI model for analyst (defaults to gpt-4o-mini)
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

## Step 2: Verify Secrets

```bash
supabase secrets list
```

You should see:

- `OPENAI_API_KEY`
- `PROJECT_URL` (automatically provided)
- `SERVICE_ROLE_KEY` (automatically provided)
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `AUTH_JWT_ALLOWED_CLOCK_SKEW_SECONDS`

## Auth Alignment Checklist

Edge functions now enforce the same identity expectations as the Expo app. Set the JWT metadata secrets once per environment so auth feels seamless everywhere:

| Secret | Value | Notes |
| --- | --- | --- |
| `AUTH_JWT_ISSUER` | `https://ajqcprzxaywgdtsveewq.supabase.co/auth/v1` | Derived from project URL |
| `AUTH_JWT_AUDIENCE` | `authenticated` | Matches Supabase default and Expo client |
| `AUTH_JWT_ALLOWED_CLOCK_SKEW_SECONDS` | `120` | Gives ±2 min tolerance for device clocks |

```bash
supabase secrets set \
  AUTH_JWT_ISSUER=https://ajqcprzxaywgdtsveewq.supabase.co/auth/v1 \
  AUTH_JWT_AUDIENCE=authenticated \
  AUTH_JWT_ALLOWED_CLOCK_SKEW_SECONDS=120
```

Every function now double-checks issuer, audience, and skew before touching the database. No extra code is required on the client—just keep using the Supabase session token the same way the app already does.

## Tamper-Evident Event Logging

The `events` table is now append-only thanks to database triggers that reject any UPDATE or DELETE. That keeps audit history immutable without adding new moving parts. Deployments automatically apply the guard (`infra/db/supabase/migrations/20251109093000_events_append_only.sql`), so there’s nothing to configure—just know that every log entry is permanent and will raise if someone tries to change or remove it.

## Step 3: Deploy Edge Functions

Deploy all new functions:

```bash
# Deploy all functions at once
supabase functions deploy

# OR deploy individually
supabase functions deploy get_operating_picture
supabase functions deploy rag_search
supabase functions deploy create_goal
supabase functions deploy analyst_query
```

## Step 4: Test Locally (Optional)

Before deploying to production, test locally:

```bash
# Start Supabase locally
supabase start

# Serve a function locally
supabase functions serve get_operating_picture --no-verify-jwt

# In another terminal, test it
curl -X POST http://localhost:54321/functions/v1/get_operating_picture \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Step 5: Verify Deployment

Check function status:

```bash
supabase functions list
```

All functions should show as `ACTIVE`.

## Step 6: Update Frontend Code

The frontend API wrappers are already created in `src/services/edgeFunctions.ts`.

To use them in your app:

```typescript
import {
  getOperatingPicture,
  ragSearch,
  createGoalEdge,
  askAnalyst,
} from "@/services/edgeFunctions";

// Example: Get operating picture
const picture = await getOperatingPicture();

// Example: Search
const results = await ragSearch({
  query: "fitness goals",
  scope: "all",
  limit: 5,
});

// Example: Create goal
const result = await createGoalEdge({
  title: "Run a marathon",
  category: "health",
});

// Example: Ask analyst
const answer = await askAnalyst({
  query: "What patterns do you see in my journal?",
});
```

## Monitoring

View function logs:

```bash
# Real-time logs
supabase functions logs get_operating_picture --follow

# Specific function logs
supabase functions logs rag_search
```

## Troubleshooting

### Error: "Missing environment variable"

- Ensure secrets are set: `supabase secrets list`
- Redeploy after setting secrets: `supabase functions deploy`

### Error: "Table not found"

- Ensure migrations are applied: `supabase db push`
- Check RLS policies are correct

### Error: "OpenAI API call failed"

- Verify OPENAI_API_KEY is valid
- Check OpenAI API usage limits

### Error: "Unauthorized"

- Ensure JWT verification is working
- Check that `verify_jwt = true` in `config.toml`
- Verify user is authenticated in frontend

## Performance Tips

1. **Caching:** Consider caching `getOperatingPicture` results for 5-10 minutes
2. **Rate Limiting:** Implement client-side rate limiting for analyst queries
3. **Pagination:** Use the `limit` parameter for RAG searches

## Next Steps

- [ ] Replace existing frontend database calls with edge function calls
- [ ] Test all edge functions in production
- [ ] Monitor function performance and costs
- [ ] Set up alerts for function failures
