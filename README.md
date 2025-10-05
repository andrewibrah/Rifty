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

- **3 Buttons at bottom**: JOURNAL / GOAL / SCHEDULE - tap to select type
- **Text input**: Type your entry
- **Send button**: Save entry (shows "Riflett is responding..." briefly)

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

- Everything saves locally (SQLite)
- AI uses OpenAI API for coaching/insights
- Long-press to delete (no clutter)
