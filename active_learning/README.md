# Active Learning Loop

Tools for harvesting intent misclassifications, prioritising labeling, and feeding new examples back into training.

## Flow
1. **Sync audits**: Pull fresh rows from `intent_audits`.
2. **Queue labeling**: Build a deduplicated review file prioritised by confidence gaps and token novelty.
3. **Merge labels**: Append confirmed labels into `training/intent/data/human_labels.json`.

## Commands
```bash
# 1. Fetch new audits (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
npx ts-node active_learning/syncIntentAudits.ts

# 2. Generate reviewer queue in active_learning/outbox/intent_label_queue.json
npx ts-node active_learning/buildLabelQueue.ts

# 3. After labeling (fill in .label field), merge into training dataset
npx ts-node active_learning/mergeLabels.ts
```

## Configuration
- Set environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `SINCE` (ISO timestamp) to override last sync checkpoint.

## Outputs
- `state/last_sync.json`: cursor storing last processed timestamp and audit id.
- `outbox/intent_audits.json`: raw audit rows used for traceability.
- `outbox/intent_label_queue.json`: human-readable JSON array for annotation.
- `outbox/merged_labels.json`: latest labeled examples staged before training merge.

## Labeling Tips
- Keep `label` aligned with `IntentLabelId` union (journal_entry, goal_create, ...).
- Add `notes` for ambiguous cases; they surface in telemetry dashboards.
- When uncertain, leave `label` empty and set `status: "needs_context"`.
