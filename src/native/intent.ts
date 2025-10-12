import { NativeModules } from 'react-native';

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
}

const buildFallback = (): NativeIntentResult => ({
  label: 'Journal Entry',
  confidence: 1,
  top3: [
    { label: 'Journal Entry', confidence: 1 },
    { label: 'Reflection Request', confidence: 0.5 },
    { label: 'Spaces', confidence: 0.25 },
  ],
  topK: [
    { label: 'Journal Entry', confidence: 1 },
    { label: 'Reflection Request', confidence: 0.5 },
    { label: 'Spaces', confidence: 0.25 },
  ],
});

export async function predictIntent(text: string): Promise<NativeIntentResult> {
  if (!RiflettIntentModule || typeof RiflettIntentModule.predict !== 'function') {
    console.warn('[intent] Native module unavailable, using fallback predictions');
    return buildFallback();
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
    return buildFallback();
  }
}
