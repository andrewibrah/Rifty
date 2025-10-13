# Runtime Intent Engine

Deterministic Naive Bayes classifier used as the on-device fallback for Riflett intents.

## Model Facts
- **Artifact**: `model.ts` — generated via `/training/intent/trainIntentModel.ts`.
- **Version**: `intent-bayes-2025-01-09`.
- **Classes**: journal entry, goal create/check-in, schedule create, reminder set, reflection request, settings change, insight link.
- **Features**: Unigrams, curated stopword list, Laplace smoothing (`alpha=1.2`), unseen token penalty `log(0.005)`.

## Runtime API
```ts
import { predictRuntimeIntent, getRuntimeIntentModel } from '../../runtime/intent-engine/index';

const prediction = predictRuntimeIntent('Schedule deep work block tomorrow at 9am');
console.log(prediction.primary);
```

## Lifecycle
1. **Data**: Exported from Supabase via `active_learning/export_audits.ts` merged with seed dataset.
2. **Training**: `training/intent/trainIntentModel.ts` builds vocabulary, computes likelihoods, writes `model.ts`.
3. **Evaluation**: `evaluation/intent/evaluateIntentModel.ts` validates accuracy + calibration before promotion.
4. **Promotion**: Commit updated `model.ts`, bump version, and update release notes.

## Notes
- Works entirely in pure TypeScript (no native dependencies) → friendly with Expo + Edge runtimes.
- Designed to be replaced by native ML kit when available; `src/native/intent.ts` automatically prefers JS runtime when native module is absent.
- Matched tokens returned per label to support audit UX and telemetry.
