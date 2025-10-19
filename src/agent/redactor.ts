import type { RedactionResult } from './types';

interface PatternConfig {
  name: string;
  createRegex: () => RegExp;
  mask: (index: number) => string;
}

const PATTERNS: PatternConfig[] = [
  {
    name: 'email',
    createRegex: () => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    mask: (i) => `[EMAIL_${i}]`,
  },
  {
    name: 'phone',
    createRegex: () => /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,3}\)|\d{2,3})[\s-]?\d{3}[\s-]?\d{4}/g,
    mask: (i) => `[PHONE_${i}]`,
  },
  {
    name: 'card',
    createRegex: () => /\b(?:\d[ -]*?){13,16}\b/g,
    mask: (i) => `[CARD_${i}]`,
  },
  {
    name: 'address',
    createRegex: () =>
      /\b\d{1,5}\s+[^\n,]+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Place|Pl\.?)\b/gi,
    mask: (i) => `[ADDR_${i}]`,
  },
];

export const Redactor = {
  mask(text: string): RedactionResult {
    if (!text) {
      return { masked: text, replacementMap: {} };
    }

    let masked = text;
    const replacementMap: Record<string, string> = {};

    PATTERNS.forEach((pattern) => {
      let index = 0;
      const regex = pattern.createRegex();
      masked = masked.replace(regex, (match) => {
        const key = pattern.mask(index);
        replacementMap[key] = match;
        index += 1;
        return key;
      });
    });

    return { masked, replacementMap };
  },

  unmask(text: string, map: Record<string, string>): string {
    if (!text) return text;
    return Object.entries(map).reduce(
      (acc, [mask, value]) => acc.split(mask).join(value),
      text
    );
  },
};
