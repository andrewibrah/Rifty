import { NativeModules } from 'react-native';

const { RiflettEmbeddingModule } = NativeModules as {
  RiflettEmbeddingModule?: {
    embed(text: string): Promise<number[]>;
    dim?: number;
  };
};

const FALLBACK_DIMENSION = 384;

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

const l2Normalize = (vector: number[]): number[] => {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (!Number.isFinite(norm) || norm <= 0) {
    return vector.map(() => 0);
  }
  return vector.map((val) => val / norm);
};

const fallbackEmbed = (text: string): number[] => {
  const dim = FALLBACK_DIMENSION;
  const output = new Array(dim).fill(0);
  const bytes = textEncoder
    ? textEncoder.encode(text)
    : Array.from(text).map((ch) => ch.charCodeAt(0) & 0xff);

  const prime = 16777619;
  let hash = 2166136261;

  bytes.forEach((byte, index) => {
    hash = (hash ^ byte) * prime;
    const idx = Math.abs(hash + index * 31) % dim;
    output[idx] += (byte / 255) * 2 - 1;
  });

  return l2Normalize(output);
};

export async function embedText(text: string): Promise<number[]> {
  if (!text) {
    return new Array(RiflettEmbeddingModule?.dim ?? FALLBACK_DIMENSION).fill(0);
  }

  if (RiflettEmbeddingModule && typeof RiflettEmbeddingModule.embed === 'function') {
    try {
      const vector = await RiflettEmbeddingModule.embed(text);
      if (Array.isArray(vector) && vector.length > 0) {
        return l2Normalize(vector.map((v) => (typeof v === 'number' ? v : Number(v))));
      }
    } catch (error) {
      console.warn('[embeddings] native embed failed, using fallback', error);
    }
  }

  return fallbackEmbed(text);
}

export { l2Normalize };
