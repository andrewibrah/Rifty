# Riflett

Modern journaling app with 3 types: Journal, Goal, Schedule. Dark theme UI with AI insights.

## Setup

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`

### Install & Run

```bash
npm install
npm start
```

Then press:

- `w` for web
- `i` for iOS simulator
- `a` for Android emulator

## How to Use

### Main Screen

- **Auto classification**: Every message is routed to Journal, Goal, or Schedule automatically.
- **Text input**: Type your entry and tap **Send**.
- **Badge**: Each bubble shows the resolved type so you can confirm the intent.

### Header

- **List icon (left)**: Open history
- **Riflett (center)**: App name
- **Pencil icon (right)**: Clear chat (only visible when you have messages)

### History Screen

- **3 category cards**: Tap Journal, Goal, or Schedule
- **Entry list**: Shows all entries with date and note count badge
- **Tap entry**: View full conversation
- **Long-press entry**: Delete it
- **Add notes**: Type in bottom input, tap Send
- **Ask AI**: Toggle to "Ask AI" mode for insights

## That's It

- Entries sync to Supabase and include AI intent metadata.
- AI uses OpenAI for intent detection and coaching/insights.
- Long-press to delete (no clutter).

## Edge Function

Run the classifier locally:

```bash
supabase functions serve classify_and_create_entry
```

Happy-path test call (replace the tokens with real values):

```bash
curl \
  -X POST \
  "$SUPABASE_URL/functions/v1/classify_and_create_entry" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"Run 5k every Tuesday morning."}'
```
