# Quick Deployment Commands

## Step 1: Link to Your Supabase Project (if not already linked)

```bash
supabase link --project-ref ajqcprzxaywgdtsveewq
```

## Step 2: Set Required Secrets

```bash
# Set OpenAI API Key (REQUIRED)
supabase secrets set OPENAI_API_KEY=your_openai_key_here

# Optional: Verify secrets are set
supabase secrets list
```

## Step 3: Deploy Edge Functions

### Option A: Use the deployment script

```bash
./deploy-edge-functions.sh
```

### Option B: Deploy manually

```bash
# Deploy all functions
supabase functions deploy get_operating_picture
supabase functions deploy rag_search
supabase functions deploy create_goal
supabase functions deploy analyst_query
```

### Option C: Deploy all at once

```bash
supabase functions deploy
```

## Step 4: Verify Deployment

```bash
# List all functions
supabase functions list

# Check specific function logs
supabase functions logs get_operating_picture
```

## Step 5: Test Functions

Use the frontend API wrappers in `src/services/edgeFunctions.ts`:

```typescript
import {
  getOperatingPicture,
  ragSearch,
  createGoalEdge,
  askAnalyst,
} from "@/services/edgeFunctions";

// Test operating picture
const picture = await getOperatingPicture();
console.log("Operating Picture:", picture);

// Test RAG search
const results = await ragSearch({
  query: "fitness goals",
  scope: "all",
  limit: 5,
});
console.log("Search Results:", results);

// Test goal creation
const goalResult = await createGoalEdge({
  title: "Run a marathon",
  description: "Complete a full marathon within 6 months",
  category: "health",
});
console.log("Goal Created:", goalResult);

// Test analyst query
const answer = await askAnalyst({
  query: "What patterns do you see in my journal entries?",
});
console.log("Analyst Answer:", answer);
```

## Troubleshooting

### "Project not linked"

Run: `supabase link --project-ref ajqcprzxaywgdtsveewq`

### "Missing OPENAI_API_KEY"

Run: `supabase secrets set OPENAI_API_KEY=your_key`

### "Function deployment failed"

- Check function logs: `supabase functions logs <function-name>`
- Verify TypeScript syntax
- Ensure all imports are correct

### "RPC function not found"

- Ensure database migrations are applied
- Check that `match_entry_embeddings` and `match_goal_embeddings` RPC functions exist

## Next Steps After Deployment

1. **Update Frontend Code:**
   - Replace direct database calls with edge function calls
   - Use `src/services/edgeFunctions.ts` wrappers

2. **Monitor Performance:**
   - Set up logging alerts
   - Monitor function execution times
   - Track OpenAI API usage

3. **Optimize:**
   - Add client-side caching for operating picture
   - Implement rate limiting for analyst queries
   - Consider pagination for large result sets

## Summary

You've created and deployed 4 new edge functions:

1. ✅ **get_operating_picture** - Multi-table memory aggregation
2. ✅ **rag_search** - Vector similarity search
3. ✅ **create_goal** - Goal creation with embeddings
4. ✅ **analyst_query** - AI-powered Q&A

All functions are secure, server-side, and properly handle:

- Authentication & authorization
- OpenAI API key protection
- Error handling
- Rate limiting (via Supabase)
