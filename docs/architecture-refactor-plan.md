# Riflett Architecture Refactor Plan

**Version**: 1.0
**Created**: 2025-10-13
**Status**: Draft → Ready for Execution
**Estimated Duration**: 3-5 days (automated execution)

---

## Executive Summary

This plan transforms Riflett from a **layer-first** structure to a **feature-first modular architecture** while maintaining 100% behavioral compatibility. The refactor addresses critical coupling issues, improves maintainability, and establishes clear module boundaries for future development.

### Key Metrics
- **Files to Refactor**: 66 TypeScript files
- **New Structure**: 6 feature modules + shared infrastructure
- **Breaking Changes**: None (internal only)
- **Test Coverage**: Maintain existing coverage, add integration tests

---

## Current State Analysis

### Current Structure (Layer-First)
```
src/
├── agent/        # 14 files - Intent processing pipeline
├── chat/         # 1 file - Message orchestration
├── components/   # 13 files - UI components
├── constants/    # 2 files - Static definitions
├── contexts/     # 1 file - React context
├── hooks/        # 5 files - State management
├── lib/          # 3 files - Supabase, utilities
├── native/       # 1 file - ML bridge
├── screens/      # 10 files - Screen components
├── services/     # 4 files - External integrations
├── theme/        # 1 file - Design tokens
├── types/        # 8 files - TypeScript definitions
└── utils/        # 3 files - Utilities
```

### Problems Identified
1. **High Coupling**: `useChatState.ts` has 12 dependencies
2. **Layer Violations**: Hooks import directly from agent/
3. **Circular Risks**: agent ↔ services ↔ lib triangle
4. **Import Chaos**: 55% relative imports, 9 files use `../../../`
5. **Code Duplication**: 4 patterns repeated across files
6. **Missing Boundaries**: No module encapsulation via barrel exports

---

## Target Architecture (Feature-First)

### New Structure
```
src/
├── modules/
│   ├── journal/          # Journal entry management
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── index.ts
│   ├── goals/            # Goal tracking
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── index.ts
│   ├── schedule/         # Calendar and scheduling
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── index.ts
│   ├── chat/             # Chat interface and message handling
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── useChatState.ts
│   │   ├── handleMessage.ts
│   │   └── index.ts
│   ├── ai/               # AI/ML intent processing
│   │   ├── intent-engine/   # From agent/
│   │   ├── memory/
│   │   ├── planner/
│   │   ├── native/          # ML bridge
│   │   ├── types/
│   │   └── index.ts
│   └── auth/             # Authentication and onboarding
│       ├── components/
│       ├── screens/
│       ├── hooks/
│       ├── types/
│       └── index.ts
│
├── shared/
│   ├── ui/               # Reusable UI components
│   │   ├── MessageBubble.tsx
│   │   ├── TypingIndicator.tsx
│   │   └── index.ts
│   ├── utils/
│   │   ├── date.ts       # NEW: Date formatting
│   │   ├── math.ts       # NEW: Math utilities
│   │   ├── strings.ts    # EXISTING
│   │   └── index.ts
│   ├── types/            # Shared TypeScript definitions
│   │   ├── common.ts
│   │   └── index.ts
│   ├── constants/
│   │   ├── intents.ts
│   │   ├── storage.ts
│   │   └── index.ts
│   └── hooks/
│       ├── useStyles.ts  # NEW: Theme hook
│       ├── useTheme.ts   # From contexts/
│       └── index.ts
│
├── infrastructure/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── storage.ts    # NEW: AsyncStorage abstraction
│   │   ├── types.ts
│   │   └── index.ts
│   ├── api/
│   │   ├── openai.ts     # From services/ai.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── data/
│   │   ├── entries.ts
│   │   ├── personalization.ts
│   │   └── index.ts
│   └── theme/
│       ├── tokens.ts
│       ├── context.tsx
│       └── index.ts
│
├── screens/              # Top-level screen coordination
│   ├── MainScreen.tsx    # Chat + Menu
│   ├── SettingsScreen.tsx
│   └── index.ts
│
└── App.tsx
```

### Design Principles

1. **Feature Cohesion**: Related code lives together
2. **Dependency Flow**: One-way from modules → shared → infrastructure
3. **Encapsulation**: Each module exports via index.ts barrel
4. **Type Safety**: Strict TypeScript, no circular type imports
5. **Test Isolation**: Each module independently testable

---

## Migration Strategy

### Phase C.1: Quick Wins (1-2 hours)
**Goal**: Eliminate technical debt without structural changes

#### C.1.1: Fix Import Paths
- Convert all `../../../` imports to `@/` aliases (9 files)
- Update tsconfig.json paths if needed
- **Impact**: Reduced cognitive load, easier refactoring

#### C.1.2: Extract Duplicate Utilities
1. **Create `src/utils/date.ts`**
   ```typescript
   export function formatDate(iso: string | undefined): string | null;
   export function formatDateTime(iso: string | undefined): string | null;
   export function formatDateKey(date: Date): string;
   ```
   - Extract from: `useChatState.ts`, `ScheduleCalendarModal.tsx`
   - Update: 2 files

2. **Create `src/utils/math.ts`**
   ```typescript
   export function clamp(value: number, min = 0, max = 1): number;
   ```
   - Extract from: `native/intent.ts`, `agent/intentRouting.ts`, `lib/intent.ts`
   - Update: 3 files

3. **Create `src/shared/hooks/useStyles.ts`**
   ```typescript
   export function useStyles() {
     const { themeMode } = useTheme();
     return {
       colors: getColors(themeMode),
       radii,
       spacing,
       typography,
       shadows
     };
   }
   ```
   - Update: 10+ component files
   - **Impact**: Consistent theme access, reduced imports

#### C.1.3: Validation Checkpoint
```bash
npm run test:intent
npx tsc --noEmit
```

---

### Phase C.2: Create Shared Infrastructure (2-3 hours)
**Goal**: Establish foundation for module migration

#### C.2.1: Storage Abstraction
Create `src/infrastructure/supabase/storage.ts`:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export const Storage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
  async clear(): Promise<void> {
    await AsyncStorage.clear();
  }
};
```
- **Migrate**: 11 files using AsyncStorage directly
- **Benefits**: Testability, future backend switching

#### C.2.2: Reorganize Infrastructure
```
src/infrastructure/
├── supabase/
│   ├── client.ts        # From lib/supabase.ts
│   ├── storage.ts       # NEW
│   └── index.ts
├── api/
│   ├── openai.ts        # From services/ai.ts
│   └── index.ts
├── data/
│   ├── entries.ts       # From lib/entries.ts
│   ├── data-service.ts  # From services/data.ts
│   ├── personalization.ts # From services/personalization.ts
│   └── index.ts
└── theme/
    ├── tokens.ts        # From theme/index.ts
    ├── context.tsx      # From contexts/ThemeContext.tsx
    └── index.ts
```

#### C.2.3: Validation Checkpoint
```bash
npm run test:intent
npm run eval:intent
```

---

### Phase C.3: Module Extraction (3-4 hours)
**Goal**: Migrate to feature-first structure

#### C.3.1: Extract AI Module (Highest Priority)
**Why first**: Largest domain, highest complexity

```
src/modules/ai/
├── intent-engine/
│   ├── intentRouting.ts    # From agent/intentRouting.ts
│   ├── pipeline.ts          # From agent/pipeline.ts
│   ├── slotFiller.ts        # From agent/slotFiller.ts
│   ├── redactor.ts          # From agent/redactor.ts
│   ├── types.ts             # From agent/types.ts
│   └── index.ts
├── memory/
│   ├── memory.ts            # From agent/memory.ts
│   ├── embeddings.ts        # From agent/embeddings.ts
│   ├── cache.ts             # From agent/cache.ts
│   └── index.ts
├── planner/
│   ├── planner.ts           # From agent/planner.ts
│   ├── actions.ts           # From agent/actions.ts
│   └── index.ts
├── telemetry/
│   ├── telemetry.ts         # From agent/telemetry.ts
│   ├── outbox.ts            # From agent/outbox.ts
│   └── index.ts
├── native/
│   ├── intent.ts            # From native/intent.ts
│   └── index.ts
├── config/
│   └── userConfig.ts        # From agent/userConfig.ts
├── types/
│   └── index.ts
└── index.ts                 # Barrel export
```

**Barrel Export** (`src/modules/ai/index.ts`):
```typescript
// Public API
export { handleUtterance } from './intent-engine/pipeline';
export { Memory } from './memory/memory';
export { planAction } from './planner/planner';
export { Telemetry } from './telemetry/telemetry';
export { classifyIntent } from './native/intent';

// Types
export type {
  EnrichedPayload,
  RouteDecision,
  RoutedIntent,
  IntentPredictionResult
} from './types';

// Internal modules NOT exported
// - slotFiller, redactor, embeddings, cache, outbox
```

**Update all imports**:
- Search: `from '@/agent/`
- Replace: `from '@/modules/ai/`
- Files affected: 20+

#### C.3.2: Extract Chat Module
```
src/modules/chat/
├── components/
│   ├── MessageBubble.tsx      # From components/
│   ├── MessageInput.tsx       # From components/
│   ├── ChatHeader.tsx         # From components/
│   └── index.ts
├── hooks/
│   ├── useChatState.ts        # From hooks/ (REFACTORED)
│   │   # Split into:
│   ├── useMessageState.ts     # Message management
│   ├── useIntentProcessing.ts # ML/AI pipeline
│   └── useEntryPersistence.ts # Save/load logic
├── types/
│   ├── chat.ts                # From types/chat.ts
│   └── index.ts
├── handleMessage.ts           # From chat/handleMessage.ts
└── index.ts
```

**Refactor `useChatState.ts`** (12 deps → 3 hooks with <5 deps each):
```typescript
// useMessageState.ts - Pure message management
export function useMessageState() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const loadMessages = async () => { /* ... */ };
  const patchMessage = (id, patch) => { /* ... */ };
  return { messages, loadMessages, patchMessage };
}

// useIntentProcessing.ts - Intent detection & routing
export function useIntentProcessing() {
  const processIntent = async (text: string) => {
    const intent = await handleMessage(text);
    return intent;
  };
  return { processIntent };
}

// useEntryPersistence.ts - Save to Supabase
export function useEntryPersistence() {
  const saveEntry = async (entry: CreateEntryArgs) => {
    const saved = await createEntryFromChat(entry);
    await Memory.upsert({ /* ... */ });
    return saved;
  };
  return { saveEntry };
}

// useChatState.ts - Orchestration layer
export function useChatState(onEntryCreated?: () => void) {
  const { messages, loadMessages, patchMessage } = useMessageState();
  const { processIntent } = useIntentProcessing();
  const { saveEntry } = useEntryPersistence();

  const sendMessage = async (content: string) => {
    // Orchestrate the 3 concerns
    const intent = await processIntent(content);
    const saved = await saveEntry({ intent, content });
    patchMessage(tempId, { id: saved.id });
    onEntryCreated?.();
  };

  return { messages, sendMessage, /* ... */ };
}
```

#### C.3.3: Extract Journal, Goals, Schedule Modules
```
src/modules/journal/
├── components/
│   └── MenuEntryChat.tsx      # From components/menu/
├── hooks/
│   └── useJournalEntries.ts
├── types/
│   └── index.ts
└── index.ts

src/modules/goals/
├── components/
│   └── GoalCard.tsx           # NEW or extracted
├── hooks/
│   └── useGoals.ts
├── types/
│   └── index.ts
└── index.ts

src/modules/schedule/
├── components/
│   └── ScheduleCalendarModal.tsx  # From components/
├── hooks/
│   └── useSchedule.ts
├── types/
│   └── index.ts
└── index.ts
```

#### C.3.4: Extract Auth Module
```
src/modules/auth/
├── components/
│   ├── Auth.tsx               # From components/
│   ├── WelcomeAuth.tsx        # From components/auth/
│   ├── EmailAuth.tsx          # From components/auth/
│   └── index.ts
├── screens/
│   ├── OnboardingFlow.tsx     # From screens/onboarding/
│   └── steps/
│       ├── IntroStep.tsx
│       ├── IdentityStep.tsx
│       ├── GoalsStep.tsx
│       ├── ToneStep.tsx
│       ├── AnchorsStep.tsx
│       ├── WorkingStyleStep.tsx
│       ├── ReviewStep.tsx
│       └── index.ts
├── hooks/
│   ├── useAuth.ts
│   └── usePersonalization.ts  # From hooks/
├── types/
│   ├── personalization.ts     # From types/
│   └── index.ts
└── index.ts
```

#### C.3.5: Create Shared UI Module
```
src/shared/ui/
├── MenuModal.tsx              # From components/
├── MenuList.tsx               # From components/
├── SettingsModal.tsx          # From components/
├── TypingIndicator.tsx        # From components/
├── Account.tsx                # From components/
└── index.ts
```

#### C.3.6: Validation Checkpoint
```bash
npm run test:intent
npm run train:intent
npm run eval:intent
npx tsc --noEmit
```

---

### Phase C.4: Update App.tsx and Screens (30 min)
**Goal**: Wire new module structure to top-level app

#### C.4.1: Update App.tsx
```typescript
// Before
import ChatHeader from "./src/components/ChatHeader";
import MessageBubble from "./src/components/MessageBubble";
import { useChatState } from "./src/hooks/useChatState";

// After
import { ChatHeader, MessageBubble, useChatState } from "@/modules/chat";
import { OnboardingFlow } from "@/modules/auth";
import { MenuModal } from "@/shared/ui";
import { useTheme, useStyles } from "@/shared/hooks";
```

#### C.4.2: Update Screens
```typescript
// screens/SettingsScreen.tsx
import { usePersonalization } from "@/modules/auth";
import { useTheme } from "@/shared/hooks";
import { Account } from "@/shared/ui";
```

#### C.4.3: Update Runtime and Tests
```typescript
// runtime/intent-engine/index.ts
import { classifyIntent } from "@/modules/ai/native";

// tests/intent-runtime.test.ts
import { handleUtterance } from "@/modules/ai";
```

---

## Phase D: Validation & Testing

### D.1: TypeScript Validation
```bash
npx tsc --noEmit
```
**Expected**: Zero errors

### D.2: Intent Pipeline Tests
```bash
npm run test:intent
```
**Expected**: All tests pass

### D.3: Model Training Validation
```bash
npm run train:intent
```
**Expected**: Training completes, model accuracy maintained

### D.4: Model Evaluation
```bash
npm run eval:intent
```
**Expected**: Accuracy >= baseline (within 1%)

### D.5: Active Learning Pipeline
```bash
npm run active:sync
npm run active:queue
npm run active:merge
```
**Expected**: All commands complete successfully

### D.6: Runtime Testing
```bash
npm start
```
**Manual Tests**:
- ✅ Auth flow works
- ✅ Onboarding completes
- ✅ Chat message sends and saves
- ✅ Intent classification accurate
- ✅ Memory search retrieves context
- ✅ Schedule modal opens
- ✅ Settings update persists
- ✅ Theme switching works
- ✅ Dark mode preserved

---

## Phase E: Documentation & Finalization

### E.1: Update README.md
- Add new architecture diagram
- Update file structure documentation
- Add module descriptions
- Update contribution guidelines

### E.2: Create Module READMEs
Each module gets a README:
```markdown
# Chat Module

## Purpose
Manages chat interface, message state, and intent processing orchestration.

## Public API
- `useChatState()` - Main chat state hook
- `ChatHeader` - Header component with menu/calendar
- `MessageBubble` - Message display component
- `MessageInput` - Text input component

## Internal Structure
- `hooks/useMessageState.ts` - Message management
- `hooks/useIntentProcessing.ts` - Intent detection
- `hooks/useEntryPersistence.ts` - Save/load logic

## Dependencies
- `@/modules/ai` - Intent classification
- `@/infrastructure/data` - Entry persistence
- `@/shared/ui` - Reusable components
```

### E.3: Generate Architecture Diagram
Create visual diagram showing:
- Module boundaries
- Dependency flow
- Public APIs
- Shared infrastructure

### E.4: Create Migration Changelog
```markdown
# Refactor Changelog

## Moved Files
- `src/agent/*` → `src/modules/ai/intent-engine/`
- `src/hooks/useChatState.ts` → `src/modules/chat/hooks/`
- ...

## New Files
- `src/utils/date.ts` - Date formatting utilities
- `src/utils/math.ts` - Math utilities (clamp)
- `src/shared/hooks/useStyles.ts` - Theme hook
- `src/infrastructure/supabase/storage.ts` - Storage abstraction

## Breaking Changes
None - all changes are internal

## Deprecated (To Remove in v2.1)
- Old import paths (still work via tsconfig aliases)
```

### E.5: Final Validation
```bash
git status
npx tsc --noEmit
npm run test:intent
npm run eval:intent
npm start
```

---

## Rollback Plan

If any phase fails:

### Immediate Rollback
```bash
git reset --hard HEAD
git clean -fd
```

### Partial Rollback (Phase-specific)
Each phase is committed atomically:
```bash
git log --oneline  # Find commit before failing phase
git reset --hard <commit-hash>
```

### Rollback Triggers
- TypeScript errors that can't be resolved in 15 minutes
- Test accuracy drops >2%
- Runtime crashes in core flows
- Build failures

---

## Success Metrics

### Code Quality
- ✅ Zero TypeScript errors
- ✅ No circular dependencies
- ✅ Max fan-out per file: <8
- ✅ Path alias usage: >80%
- ✅ All modules have barrel exports

### Functionality
- ✅ All existing features work identically
- ✅ Intent classification accuracy maintained
- ✅ All npm scripts run successfully
- ✅ Dark mode preserved
- ✅ No user-visible changes

### Architecture
- ✅ Clear module boundaries
- ✅ Unidirectional dependency flow
- ✅ Shared infrastructure properly extracted
- ✅ No layer violations
- ✅ Code duplication eliminated

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| C.1 | 1-2 hours | None |
| C.2 | 2-3 hours | C.1 complete |
| C.3 | 3-4 hours | C.2 complete |
| C.4 | 30 min | C.3 complete |
| D | 1 hour | All C complete |
| E | 1-2 hours | D complete |
| **Total** | **8-12 hours** | Sequential |

**Autonomous execution**: 3-5 days (with validation checkpoints)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Import path breakage | Medium | High | Atomic commits, comprehensive testing |
| Type errors after migration | Low | Medium | TypeScript strict mode, incremental |
| Test failures | Low | High | Run tests after each phase |
| Runtime regressions | Low | Critical | Manual testing checklist |
| Circular deps introduced | Low | Medium | Dependency analysis tool |

---

## Post-Refactor Benefits

### Developer Experience
- Faster file navigation (features grouped)
- Clearer mental model (domain-driven)
- Easier onboarding (module READMEs)
- Reduced cognitive load (smaller modules)

### Code Maintainability
- No circular dependencies
- Clear module boundaries
- Testable in isolation
- Easier to refactor further

### Future Development
- New features fit into modules naturally
- Shared utilities easy to discover
- Infrastructure changes isolated
- Easier to add new developers

---

## Approval & Execution

**Status**: ✅ Ready for autonomous execution
**Estimated Start**: 2025-10-13
**Estimated Completion**: 2025-10-18

**Execution Mode**: Autonomous with checkpoints
**Reporting**: logs/refactor-progress.md updated after each phase

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
**Next Review**: After Phase C completion
