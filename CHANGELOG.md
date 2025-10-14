# Changelog

All notable changes to the Rifty app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2025-01-14

### Fixed

#### UI/Layout Issues

- **Sidebar Menu Header**: Fixed header positioning and height issues in Goals/Journals/Schedules sidebar
  - Removed excessive `minHeight` constraint causing header to be too tall
  - Changed from fixed `paddingTop` to natural vertical padding for proper positioning
  - Removed visible border/background from back button for cleaner appearance
- **Main Chat History Modal**: Completely redesigned for better usability
  - Fixed header appearing at bottom instead of top
  - Now properly displays conversations in full-screen modal view
  - Added two-screen navigation: list view → conversation detail view
  - Conversations now render as proper chat bubbles (bot messages left-aligned, user messages right-aligned)
  - Bot messages show "RIFLETT" label, user messages have no label (cleaner UX)
  - Fixed chevron arrow overlapping message counter in conversation list
  - Restored AsyncStorage integration (was incorrectly trying to use non-existent Supabase table)

- **Message Bubble Processing Indicators**: Multiple iterations to find optimal design
  - Initially used border colors to indicate processing steps
  - Switched to circular dot indicators below message bubbles
  - Final implementation: Border-based indicators mapping to specific processing steps
    - Left border: Knowledge search (step 1)
    - Top border: OpenAI request (step 2)
    - Right border: OpenAI response (step 3)
    - Skips ML detection (step 0) as it's automatic
  - Colors: Running (accent), Done (success), Error (error), Pending (border)

- **Message Input Focus Issues**: Fixed critical bug causing app crashes and focus loss
  - Completely refactored `MessageInput` component
  - Removed complex focus/selection logic that was causing keyboard shortcuts to trigger reloads
  - Added proper focus restoration after sending messages using `requestAnimationFrame`
  - Simplified component to match working pattern from `MenuEntryChat`
  - Fixed placeholder text being cut off with proper padding adjustments

- **Background Logo**: Fixed appearance in light vs dark themes
  - Dynamically sets `tintColor` to `colors.textTertiary`
  - Light theme: 0.3 opacity, Dark theme: 0.1 opacity
  - Removed fixed opacity from container

- **Settings Modal**: Fixed modal not covering entire screen
  - Changed `overlay` background to `colors.background` for full coverage
  - Removed `paddingHorizontal` that was allowing chat to peek through

#### Processing Steps

- Fixed processing steps not fully animating (was jumping to step 2)
  - Identified that `knowledge_search` step is marked "done" immediately (correct synchronous behavior)
  - Updated border color logic to properly map the 3 visible steps (excluding automatic ML detection)

#### Entry Chat Processing Indicators

- Made AI chat processing dots more visually appealing in individual entries
  - Replaced chip-style indicators with circular dots
  - Moved dots inline with "Notes" and "AI" mode switcher buttons
  - Increased dot size to 8px for better visibility
  - Added proper spacing with `marginLeft`

### Changed

#### Component Organization

- **Complete component folder restructure** for better maintainability:
  - Created `src/components/chat/` folder:
    - Moved `ChatHeader.tsx`
    - Moved `MessageBubble.tsx`
    - Moved `MessageInput.tsx`
    - Moved `TypingIndicator.tsx`
  - Created `src/components/modals/` folder:
    - Moved `MenuModal.tsx`
    - Moved `SettingsModal.tsx`
    - Moved `ChatHistoryModal.tsx` (extracted from inline implementation)
    - Moved `IntentReviewModal.tsx`
    - Moved `ScheduleCalendarModal.tsx`
  - Kept `src/components/menu/` for menu-specific components:
    - `MenuList.tsx`
    - `MenuEntryChat.tsx`
  - Updated all import paths across the codebase to reflect new structure
  - All components properly grouped by function (chat, modals, menu, auth)

#### Intent Routing

- Restored original intent routing thresholds for production use:
  - `ROUTE_AT_THRESHOLD`: 0.01 → 0.75 (requires 75% confidence)
  - `CLARIFY_LOWER_THRESHOLD`: 0.005 → 0.45 (minimum 45% for clarification)
  - More strict routing ensures higher quality intent predictions

#### History Modal Extraction

- Extracted inline history modal implementation to standalone component
  - Created `ChatHistoryModal.tsx` as reusable modal component
  - Removed 100+ lines of inline code from `MenuModal.tsx`
  - Properly uses AsyncStorage for local history storage
  - Clean separation of concerns

### Technical Improvements

- **Disabled SQLite**: Forced AsyncStorage usage for better compatibility
  - Commented out SQLite import and initialization in `src/agent/memory.ts`
  - Prevents "database is locked" and "table not found" errors
- **Build Stability**: Addressed various build and runtime issues
  - Fixed Metro bundler conflicts
  - Resolved port conflicts (8081, 8082)
  - Addressed Xcode DerivedData and disk space issues
- **Error Handling**: Added try-catch blocks for better error recovery
  - Added error handling in `handleSend` (App.tsx)
  - Improved error messages for history loading failures

### UI/UX Enhancements

- **Theme Switching**: Fixed text disappearing after theme switch in menu categories
  - Added `colors` and `styles` to `useMemo` dependency array in `MenuCategories`
- **Chat History Interface**: Modern messaging app experience
  - Proper chat bubble layout with shadows and rounded corners
  - Maximum 80% width for bubbles (prevents awkward full-width messages)
  - Clear visual distinction between bot and user messages
  - Back button navigation between list and conversation views
  - Smooth fade transitions

---

## Previous Changes

### Major UI Improvements & Feature Updates

#### Overview

Previous branch contained significant improvements to the Rifty app's user interface, authentication system, and core functionality.

#### Major Features Added

##### 1. Separated Note & AI Chat System

- **Before**: Notes and AI responses were mixed in the same conversation
- **After**: Clear separation between "Notes" and "AI Chat" modes
- **Benefits**:
  - Users can now distinguish between personal notes and AI interactions
  - AI questions/responses no longer count towards note counter
  - Cleaner, more organized conversation history

##### 2. Enhanced Entry Management

- **Delete Individual Notes**: Long-press on any note to delete it with confirmation
- **Delete All Entries**: Added "Delete All" button in footer for each entry type (Goals, Journals, Schedules)
- **Visual Improvements**: Notes now display as elegant entries instead of chat bubbles
- **Date Positioning**: Moved dates to left side for better readability

##### 3. Completely Redesigned Authentication System

- **Modern Welcome Screen**: Clean interface with logo and multiple auth options
- **Multiple Auth Methods**:
  - Sign up with email
  - Continue with Google (OAuth)
  - Continue with Apple (OAuth)
  - Simple Log In button
- **Improved Email Auth**: Dedicated email/password form with proper validation
- **Better UX**: Logo disappears during typing, smooth transitions

##### 4. Settings Redesign

- **Account Section**: Clean card design showing user email
- **Theme Selection**: Toggle between light/dark/system themes
- **Log Out Button**: Prominent, easy-to-find logout option
- **Visual Polish**: Better spacing, icons, and typography

##### 5. Menu Organization

- **Footer with Settings**: Settings button moved to bottom of menu for easy access
- **History in Categories**: "Main History" now appears as a card in menu categories
- **Cleaner Navigation**: Improved back button behavior and modal structure

---

[Unreleased]: https://github.com/yourusername/rifty/compare/main...updates/fixed-major-problems
