import { classifyIntent } from './classifier';
import { INTENT_MODEL } from './model';
import type { RuntimeIntentResult } from './types';

export function predictRuntimeIntent(text: string): RuntimeIntentResult {
  const safe = typeof text === 'string' ? text.trim() : '';
  if (!safe) {
    const baseline = classifyIntent('generic reflection');
    return {
      ...baseline,
      inferenceMs: 0,
      tokens: [],
    };
  }
  return classifyIntent(safe);
}

export function getRuntimeIntentModel() {
  const { version, createdAt, description, labels, topFeatures } = INTENT_MODEL;
  return { version, createdAt, description, labels, topFeatures };
}

export type { RuntimeIntentResult } from './types';
