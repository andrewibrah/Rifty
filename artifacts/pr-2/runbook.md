# Runbook — upgrade/types

## Deploy Steps
1. Merge onto main (no special migration steps).
2. Run the type checker to confirm strict mode passes:
   - `npx tsc --noEmit`
3. Optionally boot the app to verify Account screen styling after the RN primitive swap.

## Validation
- `npx tsc --noEmit`

## Rollback
1. Revert `tsconfig.json` to remove new strict flags.
2. Restore affected TypeScript files from the previous commit (planner, slot filler, chat state, account component).
3. Rerun `npx tsc --noEmit` to confirm the old relaxed build passes.
