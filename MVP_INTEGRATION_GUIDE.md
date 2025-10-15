# Riflett MVP Integration Guide

This guide explains how to integrate the MVP enhancements into your existing Riflett application.

## Overview

The MVP adds the following features to your existing app:
1. **Write → Reflect → Act Flow**: AI summarizes entries, extracts emotions/actions, and provides reflections
2. **Main Chat as Analyst**: Ask questions about patterns in your entries
3. **RAG Memory System**: Semantic search with embeddings for intelligent recall
4. **Goal Linking**: Automatic goal detection with micro-steps
5. **Daily/Weekly Check-ins**: Scheduled prompts for reflection

## Integration Steps

### 1. Database Migration

Run the new migration to add tables for summaries, embeddings, goals, user facts, and check-ins:

```bash
# If using Supabase CLI
supabase db reset

# Or apply the migration manually
psql -d your_database < supabase/migrations/20250114000000_mvp_enhancements.sql
```

**Important**: The migration requires `pgvector` extension. Ensure it's enabled:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Deploy New Edge Function

Deploy the MVP entry processing function:

```bash
supabase functions deploy process_entry_mvp
```

Set environment variables:
- `OPENAI_API_KEY` - Your OpenAI API key
- `PROJECT_URL` - Your Supabase project URL
- `SERVICE_ROLE_KEY` - Your Supabase service role key

### 3. Update App.tsx to Use MVP Flow

Replace the `useChatState` import in `App.tsx`:

```typescript
// Old
import { useChatState } from "./src/hooks/useChatState";

// New
import { useChatStateMVP as useChatState } from "./src/hooks/useChatStateMVP";
```

### 4. Add Action and Goal Prompts

Update the ChatScreen component in `App.tsx` to display action and goal prompts:

```typescript
import ActionPrompt from './src/components/ActionPrompt'
import GoalPrompt from './src/components/GoalPrompt'

// In ChatScreen component
const {
  messages,
  isTyping,
  pendingAction,
  pendingGoal,
  groupMessages,
  sendMessage,
  retryMessage,
  clearMessages,
  dismissAction,
  dismissGoal,
} = useChatState(menuState.refreshAllEntryCounts)

// Add after the message list, before the input
{pendingAction && (
  <ActionPrompt
    action={pendingAction.action}
    onAccept={() => {
      // Save action as a new entry
      sendMessage(`Action: ${pendingAction.action}`)
      dismissAction()
    }}
    onEdit={() => {
      // Pre-fill input with action
      setContent(`Action: ${pendingAction.action}`)
      dismissAction()
    }}
    onDismiss={dismissAction}
  />
)}

{pendingGoal && (
  <GoalPrompt
    goalTitle={pendingGoal.goalData.title}
    goalDescription={pendingGoal.goalData.description}
    microSteps={pendingGoal.goalData.micro_steps?.map((s: any) => s.description)}
    onCreateGoal={() => {
      Alert.alert('Goal Created', `"${pendingGoal.goalData.title}" has been added to your goals.`)
      dismissGoal()
    }}
    onDismiss={dismissGoal}
  />
)}
```

### 5. Add Check-In Banner

Add check-in functionality to the ChatScreen:

```typescript
import CheckInBanner from './src/components/CheckInBanner'
import { useCheckIns } from './src/hooks/useCheckIns'

// In ChatScreen component
const { pendingCheckIn, respondToCheckIn, dismissCheckIn, initializeCheckIns } = useCheckIns()

// Initialize check-ins when user logs in
useEffect(() => {
  if (session) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    initializeCheckIns(timezone)
  }
}, [session, initializeCheckIns])

// Add at the top of the message container
{pendingCheckIn && (
  <CheckInBanner
    type={pendingCheckIn.type}
    prompt={pendingCheckIn.prompt}
    onRespond={() => {
      // Pre-fill input with check-in prompt
      setContent(pendingCheckIn.prompt)
      dismissCheckIn()
    }}
    onDismiss={dismissCheckIn}
  />
)}
```

### 6. Enable Analyst Mode

Analyst mode is automatically enabled in `useChatStateMVP`. Users can now ask questions like:
- "What patterns from this week?"
- "What should I focus on today?"
- "Show me entries about work"
- "When was I last stressed?"

The system will:
1. Detect the question pattern
2. Find relevant entries using semantic search
3. Build context with summaries and user facts
4. Answer with citations

## New Features Available

### Programmatic Access

You can now access the following services in your code:

```typescript
import { summarizeEntry, detectGoal } from '../services/summarization'
import { generateEmbedding, findSimilarEntries } from '../services/embeddings'
import { answerAnalystQuery, createUserFact, listUserFacts } from '../services/memory'
import { createGoal, listGoals, updateGoal } from '../services/goals'
import { getPendingCheckIn, completeCheckIn } from '../services/checkIns'
```

### Example: Search for Similar Entries

```typescript
import { findSimilarEntries } from '../services/embeddings'
import { getJournalEntryById } from '../services/data'

const similarEntries = await findSimilarEntries('feeling overwhelmed', {
  threshold: 0.7,
  limit: 5,
})

for (const sim of similarEntries) {
  const entry = await getJournalEntryById(sim.entry_id)
  console.log(`Similarity: ${sim.similarity}`, entry?.content)
}
```

### Example: Create a User Fact

```typescript
import { createUserFact } from '../services/memory'

await createUserFact({
  fact: 'Mornings are best for deep work',
  category: 'productivity',
  confidence: 0.9,
  source_entry_ids: ['entry-id-1', 'entry-id-2'],
})
```

### Example: Generate Weekly Review

```typescript
import { listEntrySummaries } from '../services/summarization'
import { listGoals } from '../services/goals'

const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
const summaries = await listEntrySummaries({ limit: 100 })
const recentSummaries = summaries.filter(s => s.created_at > lastWeek)

// Extract themes
const allTopics = recentSummaries.flatMap(s => s.topics)
const themeCounts = allTopics.reduce((acc, topic) => {
  acc[topic] = (acc[topic] || 0) + 1
  return acc
}, {} as Record<string, number>)

const topThemes = Object.entries(themeCounts)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([theme]) => theme)

// Get active goals
const goals = await listGoals({ status: 'active' })

console.log('Weekly themes:', topThemes)
console.log('Active goals:', goals.map(g => g.title))
```

## Testing

### Test Entry Processing

1. Type a journal entry: "Had a tough day at work, feeling stressed"
2. Observe:
   - Entry is classified
   - AI provides a reflection
   - Summary is stored with emotion (e.g., "stressed")
   - Embedding is generated

### Test Goal Detection

1. Type: "I want to run 3x per week starting next month"
2. Observe:
   - Goal prompt appears
   - Suggested micro-steps are shown
   - Accepting creates a goal

### Test Analyst Mode

1. Type a question: "What patterns from this week?"
2. Observe:
   - System searches relevant entries
   - Answer includes citations
   - Dates are referenced

### Test Check-Ins

1. Wait for scheduled time (or manually trigger)
2. Observe:
   - Check-in banner appears
   - Responding to prompt creates a linked entry

## Fallback Strategy

The MVP is designed to be **backward compatible**. If any MVP feature fails:
- Old `createEntryFromChat` still works
- New `createEntryMVP` gracefully handles errors
- Summarization/embedding failures are logged but non-blocking
- Analyst queries fall back to simple search

To use the old flow:
```typescript
import { useChatState } from "./src/hooks/useChatState"; // old hook
```

## Performance Considerations

- **Embeddings**: Generated asynchronously, don't block UI
- **Summarization**: Runs in background, entry is created first
- **Goal Detection**: Non-blocking, happens after entry creation
- **Similarity Search**: Fast with proper indexing (add `pgvector` indexes)

## Troubleshooting

### "OpenAI API key is missing"
Set `EXPO_PUBLIC_OPENAI_API_KEY` in your environment or `app.config.js`.

### "Failed to generate embedding"
Check that OpenAI API key has access to `text-embedding-3-small` model.

### "match_entry_embeddings function not found"
Ensure the migration ran successfully and `pgvector` extension is enabled.

### Check-ins not appearing
Call `initializeCheckIns(timezone)` after user logs in.

## Next Steps

1. Run the migration
2. Deploy the edge function
3. Update `App.tsx` with MVP hooks
4. Test the complete flow
5. Customize prompts and UI to match your brand

For questions or issues, see the main README or open an issue.
