import { toTitleCase } from '@/utils/strings';
import type { RoutedIntent } from './types';

const WEEKDAY_ORDER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export interface SlotFillOptions {
  userTimeZone?: string;
  now?: Date;
}

interface ParsedDateParts {
  date?: Date;
  timeApplied?: boolean;
}

const clampValue = (value: number, max: number): number => {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
};

const minutesToISO = (date: Date): string => {
  return date.toISOString();
};

const resolveNow = (now?: Date): Date => (now ? new Date(now) : new Date());

const findWeekday = (text: string, now: Date): ParsedDateParts => {
  const match = text.match(/\b(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (!match) return {};

  const [, hint, weekdayRaw] = match;
  if (!weekdayRaw) {
    return {};
  }
  const weekday = WEEKDAY_ORDER[weekdayRaw.toLowerCase()];
  if (weekday === undefined) {
    return {};
  }
  const today = new Date(now);
  const todayIdx = today.getDay();
  let daysAhead = (weekday - todayIdx + 7) % 7;

  if (daysAhead === 0 && hint?.toLowerCase() === 'next') {
    daysAhead = 7;
  } else if (daysAhead === 0 && hint?.toLowerCase() === 'this') {
    daysAhead = 0;
  } else if (daysAhead === 0 && !hint) {
    daysAhead = 7; // assume future if unspecified and same day mentioned
  }

  const target = new Date(today);
  target.setDate(today.getDate() + daysAhead);
  return { date: target };
};

const findRelativeDay = (text: string, now: Date): ParsedDateParts => {
  if (/\btoday\b/i.test(text)) {
    return { date: new Date(now) };
  }
  if (/\btomorrow\b/i.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { date: tomorrow };
  }
  if (/\bday after tomorrow\b/i.test(text)) {
    const target = new Date(now);
    target.setDate(target.getDate() + 2);
    return { date: target };
  }
  return {};
};

const findExplicitDate = (text: string, now: Date): ParsedDateParts => {
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return { date };
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const [, monthRaw, dayRaw, yearRaw] = slashMatch;
    if (!monthRaw || !dayRaw) {
      return {};
    }
    const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : now.getFullYear();
    const date = new Date(year, Number(monthRaw) - 1, Number(dayRaw));
    return { date };
  }

  const monthMatch = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i);
  if (monthMatch) {
    const [, monthRaw, dayRaw, yearRaw] = monthMatch;
    if (!monthRaw || !dayRaw) {
      return {};
    }
    const month = MONTHS.indexOf(monthRaw.toLowerCase());
    if (month < 0) {
      return {};
    }
    const year = yearRaw ? Number(yearRaw) : now.getFullYear();
    const date = new Date(year, month, Number(dayRaw));
    return { date };
  }

  return {};
};

const applyTime = (text: string, seed: Date | undefined, now: Date): ParsedDateParts => {
  const timeMatch = text.match(/\b(?:at|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!timeMatch) return {};
  const [, hourRaw, minuteRaw, meridiemRaw] = timeMatch;
  if (!hourRaw) {
    return {};
  }
  let hours = clampValue(Number(hourRaw), 23);
  const minutes = clampValue(Number(minuteRaw ? Number(minuteRaw) : 0), 59);

  if (meridiemRaw) {
    const meridiem = meridiemRaw.toLowerCase();
    if (meridiem === 'pm' && hours < 12) {
      hours += 12;
    }
    if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }
  }

  const base = seed ? new Date(seed) : new Date(now);
  base.setHours(hours, minutes, 0, 0);
  return { date: base, timeApplied: true };
};

const ensurePastIsFuture = (date: Date, now: Date): Date => {
  if (date.getTime() < now.getTime()) {
    const adjusted = new Date(date);
    adjusted.setDate(adjusted.getDate() + 7);
    return adjusted;
  }
  return date;
};

const deriveSlots = (text: string, baseIntent: RoutedIntent, options?: SlotFillOptions): Record<string, string> => {
  const now = resolveNow(options?.now);
  const resultSlots: Record<string, string> = { ...baseIntent.slots };
  const normalizedLabel = (baseIntent.rawLabel || baseIntent.label).toLowerCase();

  const weekday = findWeekday(text, now);
  const relative = findRelativeDay(text, now);
  const explicit = findExplicitDate(text, now);

  let candidateDate = explicit.date ?? relative.date ?? weekday.date;

  if (!candidateDate && /\btonight\b/i.test(text)) {
    candidateDate = new Date(now);
    candidateDate.setHours(20, 0, 0, 0);
  }

  const time = applyTime(text, candidateDate ?? new Date(now), now);
  if (time.date) {
    candidateDate = time.date;
  }

  if (candidateDate) {
    const adjusted =
      baseIntent.label.toLowerCase().includes('schedule')
        ? ensurePastIsFuture(candidateDate, now)
        : candidateDate;
    const iso = minutesToISO(adjusted);
    if (normalizedLabel.includes('schedule')) {
      resultSlots.start = iso;
      if (!time.timeApplied) {
        const end = new Date(adjusted);
        end.setHours(end.getHours() + 1);
        resultSlots.end = minutesToISO(end);
      }
    } else if (normalizedLabel.includes('goal')) {
      const [datePart] = iso.split('T');
      if (datePart) {
        resultSlots.due = datePart;
      }
    } else if (normalizedLabel.includes('journal')) {
      resultSlots.ts = iso;
    }
  }

  const durationMatch = text.match(/for\s+(\d{1,2})\s*(minutes?|hours?)/i);
  if (durationMatch) {
    const [, qtyRaw, unitRaw] = durationMatch;
    if (qtyRaw) {
      const qty = Number(qtyRaw);
      const unit = unitRaw && unitRaw.toLowerCase().startsWith('hour') ? 60 : 1;
      const minutes = qty * unit;
      resultSlots.duration_minutes = String(minutes);
    }
  }

  if (!resultSlots.title && normalizedLabel.includes('goal')) {
    const match = text.match(/(?:goal|aim|plan)\s+(?:to|is to)?\s*(.+)$/i);
    if (match && match[1]) {
      resultSlots.title = toTitleCase(match[1].trim());
    }
  }

  if (!resultSlots.title && normalizedLabel.includes('journal')) {
    const titleMatch = text.match(/(?:about|on)\s+([^.!?]+)/i);
    if (titleMatch && titleMatch[1]) {
      resultSlots.title = toTitleCase(titleMatch[1].trim());
    }
  }

  return resultSlots;
};

export const SlotFiller = {
  fill(text: string, intent: RoutedIntent, options?: SlotFillOptions): RoutedIntent {
    const slots = deriveSlots(text, intent, options);
    return {
      ...intent,
      slots,
    };
  },
};
