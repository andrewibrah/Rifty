# Intent Training Pipeline

Scripts for retraining the on-device intent classifier.

## Files
- `data/seed_intents.json`: curated starter dataset covering all supported intents.
- `data/human_labels.json`: append human-labeled examples exported from active learning.
- `trainIntentModel.ts`: generates `runtime/intent-engine/model.ts`.

## Usage
```bash
# Optional: add new labeled rows to data/human_labels.json
npx ts-node training/intent/trainIntentModel.ts
```

The script prints dataset stats and rewrites the runtime model artifact. Commit the generated file together with dataset changes and update the version in release notes.

## Guidelines
1. Keep examples concise; use natural phrasing from production transcripts.
2. Include both positive and ambiguous cases (e.g., “remind me” vs “schedule”).
3. When adding new intents, update:
   - `LABEL_DEFINITIONS` in `trainIntentModel.ts`
   - `runtime/intent-engine/types.ts`
   - `src/constants/intents.ts`
   - Supabase edge functions & routing constants
4. After training, run evaluation scripts (`evaluation/intent/evaluateIntentModel.ts`).
