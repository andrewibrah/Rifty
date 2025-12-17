import type { RedactionResult } from "./types";

interface PatternConfig {
  name: string;
  createRegex: () => RegExp;
  mask: (index: number) => string;
  isMatchValid?: (match: string) => boolean;
}

const PATTERNS: PatternConfig[] = [
  {
    name: "email",
    createRegex: () => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    mask: (i) => `[EMAIL_${i}]`,
  },
  {
    name: "phone",
    createRegex: () =>
      /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,3}\)|\d{2,3})[\s-]?\d{3}[\s-]?\d{4}/g,
    mask: (i) => `[PHONE_${i}]`,
  },
  {
    name: "card",
    // Matches 13–19 digits allowing spaces or dashes between groups.
    // Still prone to false positives; consider Luhn validation or a dedicated library in production.
    createRegex: () => /\b(?:\d[\s-]*){13,19}\d\b/g,
    isMatchValid: (match) => {
      const digitsOnly = match.replace(/\D/g, "");
      return digitsOnly.length >= 13 && digitsOnly.length <= 19;
    },
    mask: (i) => `[CARD_${i}]`,
  },
  {
    name: "address",
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
        if (pattern.isMatchValid && !pattern.isMatchValid(match)) {
          return match;
        }
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
