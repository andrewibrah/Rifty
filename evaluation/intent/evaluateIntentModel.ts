import { promises as fs } from 'fs';
import path from 'path';
import { predictRuntimeIntent } from '../../runtime/intent-engine/index';
import type { IntentLabelId } from '../../runtime/intent-engine/types';

interface EvalExample {
  id: string;
  label: IntentLabelId;
  text: string;
}

interface MetricsSummary {
  accuracy: number;
  top3Accuracy: number;
  perClass: Record<IntentLabelId, { accuracy: number; support: number }>;
  confusion: Record<IntentLabelId, Record<IntentLabelId, number>>;
}

const BASE_DIR = path.resolve(process.cwd(), 'evaluation/intent');
const HOLDOUT_PATH = path.join(BASE_DIR, 'holdout.json');
const REPORT_DIR = path.join(BASE_DIR, 'reports');

const LABELS: IntentLabelId[] = [
  'journal_entry',
  'goal_create',
  'goal_check_in',
  'schedule_create',
  'reminder_set',
  'reflection_request',
  'settings_change',
  'insight_link',
];

async function loadHoldout(): Promise<EvalExample[]> {
  const raw = await fs.readFile(HOLDOUT_PATH, 'utf8');
  return JSON.parse(raw) as EvalExample[];
}

function emptyConfusionMatrix(): Record<IntentLabelId, Record<IntentLabelId, number>> {
  const base: Record<IntentLabelId, Record<IntentLabelId, number>> = Object.create(null);
  for (const actual of LABELS) {
    const row: Record<IntentLabelId, number> = Object.create(null);
    for (const predicted of LABELS) {
      row[predicted] = 0;
    }
    base[actual] = row;
  }
  return base;
}

function toIntentId(label: string): IntentLabelId {
  const normalized = label.toLowerCase().replace(/\s+/g, '_');
  const match = LABELS.find((item) => item === normalized);
  return match ?? 'journal_entry';
}

function computeMetrics(
  data: Array<{
    example: EvalExample;
    prediction: ReturnType<typeof predictRuntimeIntent>;
  }>
): MetricsSummary {
  let correct = 0;
  let correctTop3 = 0;
  const perClassCounts: Record<IntentLabelId, { correct: number; total: number }> = Object.create(null);
  const confusion = emptyConfusionMatrix();

  for (const label of LABELS) {
    perClassCounts[label] = { correct: 0, total: 0 };
  }

  for (const { example, prediction } of data) {
    const predictedId = toIntentId(prediction.primary.label);
    const actualId = example.label;
    perClassCounts[actualId].total += 1;
    confusion[actualId][predictedId] += 1;

    if (predictedId === actualId) {
      correct += 1;
      perClassCounts[actualId].correct += 1;
    }

    const hit = prediction.topK.some((candidate) => toIntentId(candidate.label) === actualId);
    if (hit) {
      correctTop3 += 1;
    }
  }

  const total = data.length || 1;
  const perClass: MetricsSummary['perClass'] = Object.create(null);

  for (const label of LABELS) {
    const counts = perClassCounts[label];
    perClass[label] = {
      accuracy: counts.total ? counts.correct / counts.total : 0,
      support: counts.total,
    };
  }

  return {
    accuracy: correct / total,
    top3Accuracy: correctTop3 / total,
    perClass,
    confusion,
  };
}

async function writeReport(metrics: MetricsSummary) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `intent_eval_${timestamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    modelVersion: predictRuntimeIntent('placeholder').modelVersion,
    metrics,
  };
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2));
  return reportPath;
}

async function main() {
  const holdout = await loadHoldout();
  const evaluations = holdout.map((example) => ({
    example,
    prediction: predictRuntimeIntent(example.text),
  }));

  const metrics = computeMetrics(evaluations);
  const reportPath = await writeReport(metrics);

  console.log('Intent evaluation complete');
  console.table(
    LABELS.map((label) => ({
      intent: label,
      accuracy: metrics.perClass[label].accuracy.toFixed(2),
      support: metrics.perClass[label].support,
    }))
  );
  console.log('Overall accuracy:', metrics.accuracy.toFixed(3));
  console.log('Top-3 accuracy:', metrics.top3Accuracy.toFixed(3));
  console.log('Report written to', path.relative(process.cwd(), reportPath));
}

main().catch((error) => {
  console.error('[evaluate-intent] failed', error);
  process.exit(1);
});
