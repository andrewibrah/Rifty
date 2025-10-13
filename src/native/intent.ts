import { NativeModules } from 'react-native';
import type { RuntimeIntentResult } from '../../runtime/intent-engine/index';
import { predictRuntimeIntent } from '../../runtime/intent-engine/index';

type NativePredictionPayload = {
  label: string;
  confidence?: number;
  top3?: { label: string; confidence: number }[];
};

type NativeModuleShape = {
  predict(text: string): Promise<NativePredictionPayload>;
};

const { RiflettIntentModule } = NativeModules as {
  RiflettIntentModule?: NativeModuleShape;
};

let warnedAboutNativeModule = false;

const clampConfidence = (value: number | undefined): number => {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }
  const safe = Number(value ?? 0);
  if (safe < 0) return 0;
  if (safe > 1) return 1;
  return safe;
};

export interface NativeIntentResult {
  label: string;
  confidence: number;
  top3: { label: string; confidence: number }[];
  topK: { label: string; confidence: number }[];
  modelVersion?: string;
  matchedTokens?: { label: string; tokens: string[] }[];
  tokens?: string[];
}

const runtimeToNative = (runtime: RuntimeIntentResult): NativeIntentResult => {
  const topK = runtime.topK.map((candidate) => ({
    label: candidate.label,
    confidence: clampConfidence(candidate.confidence),
  }));
  return {
    label: runtime.primary.label,
    confidence: clampConfidence(runtime.primary.confidence),
    top3: topK.slice(0, 3),
    topK: topK.length > 0 ? topK : [
      {
        label: runtime.primary.label,
        confidence: clampConfidence(runtime.primary.confidence),
      },
    ],
    modelVersion: runtime.modelVersion,
    matchedTokens: runtime.topK.map((candidate) => ({
      label: candidate.label,
      tokens: candidate.matchedTokens,
    })),
    tokens: runtime.tokens,
  };
};

const buildFallback = (text: string): NativeIntentResult => {
  const runtime = predictRuntimeIntent(text || '');
  return runtimeToNative(runtime);
};

export async function predictIntent(text: string): Promise<NativeIntentResult> {
  if (!RiflettIntentModule || typeof RiflettIntentModule.predict !== 'function') {
    if (!warnedAboutNativeModule) {
      console.warn('[intent] Native module unavailable, using JS runtime intent engine');
      warnedAboutNativeModule = true;
    }
    return buildFallback(text);
  }

  try {
    const res = await RiflettIntentModule.predict(text);
    const top3 = Array.isArray(res.top3)
      ? res.top3.filter(Boolean).map((item) => ({
          label: String(item.label ?? 'Unknown'),
          confidence: Number(item.confidence ?? 0),
        }))
      : [];

    const primaryLabel = typeof res.label === 'string' ? res.label : 'Journal Entry';
    const primaryConfidence = clampConfidence(
      top3[0]?.confidence ?? res?.confidence ?? 0
    );

    return {
      label: res.label ?? 'Spaces',
      confidence: primaryConfidence,
      top3,
      topK:
        top3.length > 0
          ? top3
          : [
              {
                label: primaryLabel,
                confidence: primaryConfidence,
              },
            ],
    };
  } catch (error) {
    console.warn('[intent] Native prediction failed, using fallback', error);
    return buildFallback(text);
  }
}
