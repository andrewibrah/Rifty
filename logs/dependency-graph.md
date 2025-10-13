# Riflett Dependency Graph

Generated: 2025-10-13

## Visual Architecture Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                            │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐      │
│  │  App.tsx   │  │  screens/  │  │    components/       │      │
│  │  (1100 loc)│◄─┤  (10 files)│◄─┤    (13 files)        │      │
│  └─────┬──────┘  └──────┬─────┘  └──────────┬───────────┘      │
└────────┼────────────────┼───────────────────┼──────────────────┘
         │                │                   │
         ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      HOOKS LAYER                                 │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐         │
│  │ useChatState │  │ useMenuState│  │usePersonalization│         │
│  │  (705 loc)   │  │             │  │                 │         │
│  │  [12 deps]   │  │  [4 deps]   │  │   [3 deps]      │         │
│  └──────┬───────┘  └──────┬──────┘  └────────┬────────┘         │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                    agent/                             │       │
│  │  ┌──────────┐  ┌────────┐  ┌────────┐  ┌─────────┐  │       │
│  │  │ pipeline │  │ memory │  │planner │  │intentRout│  │       │
│  │  │ (10 deps)│◄─┤ (core) │◄─┤ (3 dep)│◄─┤  (4 dep)│  │       │
│  │  └────┬─────┘  └────┬───┘  └───┬────┘  └────┬────┘  │       │
│  │       │             │          │             │        │       │
│  │  ┌────▼─────┐  ┌───▼──────┐  ┌▼────────┐  ┌▼──────┐ │       │
│  │  │slotFiller│  │telemetry │  │ outbox  │  │actions│ │       │
│  │  └──────────┘  └──────────┘  └─────────┘  └───────┘ │       │
│  └──────────────────────┬───────────────────────────────┘       │
│                         │                                        │
│  ┌──────────────────────▼────────────┐                          │
│  │          chat/                     │                          │
│  │  ┌─────────────────┐              │                          │
│  │  │ handleMessage   │              │                          │
│  │  │   (5 deps)      │              │                          │
│  │  └─────────────────┘              │                          │
│  └────────────────────────────────────┘                          │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICES LAYER                                │
│  ┌────────┐  ┌─────────────────┐  ┌────────────┐               │
│  │ data   │  │ ai (OpenAI)     │  │personalize │               │
│  │(8 fans)│  │(composeNote)    │  │            │               │
│  └───┬────┘  └────────┬────────┘  └─────┬──────┘               │
└──────┼────────────────┼──────────────────┼──────────────────────┘
       │                │                  │
       ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER                             │
│  ┌──────────┐  ┌────────────┐  ┌────────────┐                  │
│  │ supabase │  │  entries   │  │   native   │                  │
│  │(10 fans) │  │ (lib)      │  │  (ML/iOS)  │                  │
│  └──────────┘  └────────────┘  └────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
       ▲                ▲                  ▲
       │                │                  │
┌──────┴────────────────┴──────────────────┴──────────────────────┐
│                   SHARED / CROSS-CUTTING                         │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌─────────┐         │
│  │  types/  │  │ utils/  │  │constants/│  │ theme   │         │
│  │(8 files) │  │(3 files)│  │(2 files) │  │contexts │         │
│  └──────────┘  └─────────┘  └──────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Dependency Chains

### Critical Path: User Message → Entry Creation

```
MessageInput.tsx
    ↓
useChatState.ts (12 deps)
    ↓
handleMessage.ts
    ↓
agent/pipeline.ts (10 deps)
    ├─→ agent/intentRouting.ts
    ├─→ agent/memory.ts
    ├─→ agent/redactor.ts
    ├─→ agent/slotFiller.ts
    └─→ native/intent.ts (ML Core)
    ↓
agent/planner.ts
    ↓
services/ai.ts (OpenAI)
    ↓
lib/entries.ts
    ↓
services/data.ts
    ↓
lib/supabase.ts
```

### High Coupling Areas (Risk Zones)

#### 🔴 Critical: useChatState.ts (12 dependencies)
```
useChatState.ts
  ├─→ types/chat.ts
  ├─→ types/intent.ts
  ├─→ services/data.ts
  ├─→ lib/entries.ts
  ├─→ lib/intent.ts
  ├─→ services/ai.ts
  ├─→ chat/handleMessage.ts
  ├─→ agent/memory.ts
  ├─→ agent/planner.ts
  ├─→ agent/telemetry.ts
  ├─→ agent/outbox.ts
  └─→ agent/actions.ts
```
**Issue**: Single hook orchestrates too many concerns
**Solution**: Split into domain-specific hooks

#### 🟡 Medium: agent/pipeline.ts (10 dependencies)
```
agent/pipeline.ts
  ├─→ native/intent.ts
  ├─→ agent/intentRouting.ts
  ├─→ agent/slotFiller.ts
  ├─→ agent/redactor.ts
  ├─→ agent/memory.ts
  ├─→ agent/userConfig.ts
  ├─→ agent/embeddings.ts
  ├─→ agent/cache.ts
  ├─→ agent/telemetry.ts
  └─→ agent/types.ts
```
**Status**: Acceptable - this is an orchestration layer
**Improvement**: Consider dependency injection pattern

### Circular Dependency Risks

#### Agent ↔ Services ↔ Lib Triangle
```
┌──────────────┐
│ agent/       │
│  planner.ts  │
└──────┬───────┘
       │ imports services/ai.ts
       ▼
┌──────────────┐
│ services/    │
│  ai.ts       │
└──────────────┘
       │ (no direct import back)
       ▼
┌──────────────┐
│ lib/         │
│  entries.ts  │
└──────┬───────┘
       │ imports agent/types.ts, agent/memory.ts
       ▼
   [potential cycle]
```
**Risk**: Medium - currently type-only, but fragile
**Solution**: Extract shared types to types/agent-shared.ts

### Module Fan-In/Fan-Out Analysis

#### Most Imported (Shared Infrastructure)
```
agent/types.ts          ████████████ 11 dependents
contexts/ThemeContext   ████████████ 11 dependents
theme/index.ts          ████████████ 11 dependents
lib/supabase.ts         ███████████  10 dependents
services/data.ts        ████████     8 dependents
agent/memory.ts         ██████       6 dependents
native/intent.ts        █████        5 dependents
```

#### Most Complex (High Fan-Out)
```
useChatState.ts         ████████████ 12 imports
agent/pipeline.ts       ██████████   10 imports
OnboardingFlow.tsx      █████████    9 imports
handleMessage.ts        █████        5 imports
lib/entries.ts          █████        5 imports
```

## Directory-Level Dependencies

```
┌────────────┐     ┌─────────┐     ┌──────────┐
│   hooks/   │────▶│ agent/  │────▶│ native/  │
│  (5 files) │  8  │(14 files│  3  │ (1 file) │
└──────┬─────┘     └────┬────┘     └──────────┘
       │ 6              │ 2
       ▼                ▼
┌────────────┐     ┌─────────┐
│ services/  │────▶│  lib/   │
│  (4 files) │  3  │(3 files)│
└────────────┘     └────┬────┘
                        │ 2
                        ▼ (types only)
                   ┌─────────┐
                   │ agent/  │
                   │ types.ts│
                   └─────────┘
```

**Key**: Numbers represent import count between directories

## Refactoring Impact Map

### P0 Changes (Immediate)
- ✅ Fix deep relative imports: 9 files affected
- ⚠️ Split useChatState: 1 file, affects 3 downstream consumers

### P1 Changes (High Value)
- Extract date utils: 2 files → 1 new util
- Extract math utils: 3 files → 1 new util
- Create useStyles hook: 10+ files simplified

### P2 Changes (Medium Term)
- Storage abstraction: 11 files affected
- Resolve agent/services coupling: 4 files refactored
- Barrel exports: 20+ files receive index.ts

## Legend

```
┌────┐
│Box │ = Module/Directory
└────┘

  ─▶  = Import/Dependency
  ◄─  = Bidirectional

[N deps] = Outgoing dependency count
(N fans) = Incoming dependency count (fan-in)

████ = Dependency magnitude
```

---

**Generated by**: Riflett Autonomous Refactor System
**Audit Date**: 2025-10-13
**Next Review**: Post Phase C completion
