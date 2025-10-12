# PR Title
upgrade/types: enforce strict TS and harden agent pipeline

## What
- enable strict compiler flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`) in `tsconfig.json`
- fix all pre-existing `tsc --noEmit` errors by tightening intent planner errors, slot parsing guards, and chat state metadata updates
- replace RNE `Input`/`Button` usage in `Account` with typed RN components and add safe-area/gesture handler module declarations for offline compilation
- sanitize onboarding props, menu pagination, and calendar range formatting so optional values are guarded under strict mode

## Why
- TypeScript builds were failing (blocking CI) and runtime null/undefined edges around slot parsing, planner errors, and onboarding props created real crash risks
- Strict optional/index access surfaces latent bugs; addressing them now prevents regressions when we expand intents or planner outputs

## How
- added defensive parsing & conditional property writes so optional fields are omitted instead of set to `undefined`
- reworked planner error typing via `OfflineCapableError` helpers; improved native intent adapter interface to allow optional confidence
- introduced lightweight RN primitives for Account screen to avoid mismatched RNE typings under strict mode
- shipped local declaration shims for `react-native-safe-area-context` and `react-native-gesture-handler`

## Risks
- Low/Medium: new guards in slot filler could skip auto-populating fields if parser misses patterns; covered by default fallbacks
- Account screen styling tweaked to RN primitives; visually similar but should be sanity-checked in dark/light modes

## Testing
- `npx tsc --noEmit`
