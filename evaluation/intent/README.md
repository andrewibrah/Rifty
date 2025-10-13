# Intent Evaluation Harness

Offline regression tests for the intent classifier.

## Datasets
- `holdout.json`: balanced sample kept separate from training.
- Additional scenario packs can be added under `evaluation/intent/datasets/` (create as needed).

## Running
```bash
npx ts-node evaluation/intent/evaluateIntentModel.ts
```

Outputs accuracy, per-class metrics, and writes a timestamped report to `evaluation/intent/reports/`.

## Deployment Gate
Before promoting a new model:
1. Ensure `training/intent/trainIntentModel.ts` has been executed.
2. Run this evaluation script.
3. Require overall accuracy ≥ 0.85 and no class below 0.70 (adjust thresholds in release checklist as we gather more data).
4. Attach generated report to the release PR.
