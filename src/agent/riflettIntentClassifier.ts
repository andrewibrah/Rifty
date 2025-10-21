import type { MemoryRecord } from '@/agent/memory';
import { toTitleCase } from '@/utils/strings';
import { ContextWindow } from './contextWindow';

export type RiflettIntentLabel =
  | 'conversational'
  | 'entry_create'
  | 'entry_discuss'
  | 'entry_append'
  | 'command'
  | 'search_query';

export interface ClassificationCandidate {
  label: RiflettIntentLabel;
  confidence: number;
}

export interface ClassificationMeta {
  label: RiflettIntentLabel;
  confidence: number;
  reasons: string[];
  targetEntryId?: string | null;
  targetEntryType?: string | null;
  duplicateMatch?: {
    id: string;
    score: number;
    text: string;
    kind: string;
  } | null;
  topCandidates: ClassificationCandidate[];
}

const COMMAND_PATTERN = /^\s*\//;
const SEARCH_PHRASES = [
  'find',
  'show me',
  'search for',
  'when did i',
  'where did i',
  'what did i write',
  'look up',
  'list',
];
const ADDITIVE_PHRASES = [
  'also',
  'update',
  'another',
  'forgot',
  'in addition',
  'plus',
  'adding',
  'one more thing',
];
const SAVE_PHRASES = [
  'save',
  'log',
  'capture',
  'remember',
  'write this down',
  'note that',
  'journal',
  'record',
];
const TEMPORAL_MARKERS = [
  'today',
  'tonight',
  'this morning',
  'this afternoon',
  'this evening',
  'yesterday',
  'earlier',
  'just now',
  'right now',
  'tomorrow',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
const ACTION_VERBS = [
  'finished',
  'completed',
  'did',
  'ran',
  'talked',
  'spoke',
  'met',
  'decided',
  'started',
  'launched',
  'sent',
  'emailed',
  'called',
  'worked',
  'wrote',
  'built',
  'shipped',
];
const PRONOUN_ANCHORS = /\b(it|this|that|the goal|the entry|that goal|this entry|that plan|the plan|that project|this project)\b/i;
const QUESTION_MARK = /\?/;
const TIME_REGEX = /\b(\d{1,2}(:\d{2})?\s?(am|pm))\b/i;

const containsPhrase = (text: string, phrases: string[]): boolean =>
  phrases.some((phrase) => text.includes(phrase));

const hasTemporalMarker = (text: string): boolean =>
  containsPhrase(text, TEMPORAL_MARKERS) || TIME_REGEX.test(text);

const hasSaveLanguage = (text: string): boolean => containsPhrase(text, SAVE_PHRASES);

const hasAdditiveLanguage = (text: string): boolean => containsPhrase(text, ADDITIVE_PHRASES);

const hasActionLanguage = (text: string): boolean =>
  ACTION_VERBS.some((verb) => text.includes(verb));

const isSearchQuery = (text: string): boolean => containsPhrase(text, SEARCH_PHRASES);

const baseCandidate = (label: RiflettIntentLabel, confidence: number): ClassificationCandidate => ({
  label,
  confidence,
});

const DUPLICATE_THRESHOLD = 0.85;

function pickDuplicate(records: MemoryRecord[]): MemoryRecord | null {
  return records.find((record) => record.score >= DUPLICATE_THRESHOLD) ?? null;
}

function mapKindToEntryType(kind?: string | null): string | null {
  if (!kind) return null;
  const normalized = kind.toLowerCase();
  if (normalized.includes('goal')) return 'goal';
  if (normalized.includes('event')) return 'schedule';
  if (normalized.includes('entry') || normalized.includes('journal')) return 'journal';
  return null;
}

export function classifyRiflettIntent(params: {
  text: string;
  contextRecords: MemoryRecord[];
}): ClassificationMeta {
  const trimmed = params.text.trim();
  const lower = trimmed.toLowerCase();
  const reasons: string[] = [];
  const contextSnapshot = ContextWindow.snapshot();
  const recentMessages = ContextWindow.recent();

  if (!trimmed) {
    return {
      label: 'conversational',
      confidence: 0.6,
      reasons: ['Empty message defaults to conversational'],
      topCandidates: [baseCandidate('conversational', 0.6)],
    };
  }

  if (COMMAND_PATTERN.test(trimmed)) {
    reasons.push('Slash-prefixed command detected');
    return {
      label: 'command',
      confidence: 0.99,
      reasons,
      topCandidates: [baseCandidate('command', 0.99)],
    };
  }

  if (isSearchQuery(lower)) {
    reasons.push('Search verb detected');
    const confidence = lower.length > 24 ? 0.94 : 0.9;
    return {
      label: 'search_query',
      confidence,
      reasons,
      topCandidates: [
        baseCandidate('search_query', confidence),
        baseCandidate('conversational', 0.7),
      ],
    };
  }

  const duplicate = pickDuplicate(params.contextRecords);
  const duplicateMeta = duplicate
    ? {
        id: duplicate.id,
        score: duplicate.score,
        text: duplicate.text,
        kind: duplicate.kind,
      }
    : null;

  const hasAdditive = hasAdditiveLanguage(lower);
  const inWindow = Boolean(contextSnapshot?.isActive);
  const hasPronounAnchor = PRONOUN_ANCHORS.test(trimmed);

  if (duplicateMeta && hasAdditive) {
    reasons.push('High-similarity memory match with additive language');
    const entryType = mapKindToEntryType(duplicateMeta.kind);
    return {
      label: 'entry_append',
      confidence: 0.91,
      reasons,
      targetEntryId: duplicateMeta.id,
      targetEntryType: entryType,
      duplicateMatch: duplicateMeta,
      topCandidates: [
        baseCandidate('entry_append', 0.91),
        baseCandidate('entry_discuss', 0.8),
        baseCandidate('entry_create', 0.6),
      ],
    };
  }

  if (inWindow && hasPronounAnchor) {
    reasons.push('Within entry context window with pronoun reference');
    return {
      label: 'entry_discuss',
      confidence: 0.96,
      reasons,
      targetEntryId: contextSnapshot?.entryId ?? null,
      targetEntryType: contextSnapshot?.entryType ?? null,
      duplicateMatch: duplicateMeta,
      topCandidates: [
        baseCandidate('entry_discuss', 0.96),
        baseCandidate('entry_append', hasAdditive ? 0.82 : 0.7),
        baseCandidate('conversational', 0.68),
      ],
    };
  }

  if (duplicateMeta && !hasAdditive) {
    reasons.push('High-similarity memory match without clear additive cue');
  }

  const hasSave = hasSaveLanguage(lower);
  const hasTemporal = hasTemporalMarker(lower);
  const hasAction = hasActionLanguage(lower);
  const isQuestion = QUESTION_MARK.test(trimmed);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  if (!isQuestion && (hasSave || (hasTemporal && hasAction) || wordCount > 25)) {
    const createConfidence = Math.min(
      0.86 + (hasSave ? 0.08 : 0) + (hasTemporal ? 0.03 : 0) + (wordCount > 60 ? 0.03 : 0),
      0.97,
    );
    reasons.push('Declarative content suitable for structured capture');
    if (hasSave) reasons.push('Explicit save/log intent detected');
    if (hasTemporal) reasons.push('Temporal marker detected');
    if (hasAction) reasons.push('Concrete action verb detected');

    return {
      label: 'entry_create',
      confidence: createConfidence,
      reasons,
      targetEntryId: null,
      duplicateMatch: duplicateMeta,
      topCandidates: [
        baseCandidate('entry_create', createConfidence),
        baseCandidate('entry_append', duplicateMeta ? 0.78 : 0.62),
        baseCandidate('conversational', 0.6),
      ],
    };
  }

  if (hasAdditive && duplicateMeta) {
    reasons.push('Additive phrasing referencing prior context');
    return {
      label: 'entry_append',
      confidence: 0.88,
      reasons,
      targetEntryId: duplicateMeta.id,
      targetEntryType: mapKindToEntryType(duplicateMeta.kind),
      duplicateMatch: duplicateMeta,
      topCandidates: [
        baseCandidate('entry_append', 0.88),
        baseCandidate('entry_discuss', 0.72),
        baseCandidate('conversational', 0.65),
      ],
    };
  }

  if (inWindow && !isQuestion) {
    reasons.push('Context window active; defaulting follow-up to discuss');
    return {
      label: 'entry_discuss',
      confidence: 0.78,
      reasons,
      targetEntryId: contextSnapshot?.entryId ?? null,
      targetEntryType: contextSnapshot?.entryType ?? null,
      duplicateMatch: duplicateMeta,
      topCandidates: [
        baseCandidate('entry_discuss', 0.78),
        baseCandidate('entry_create', 0.6),
        baseCandidate('conversational', 0.58),
      ],
    };
  }

  if (duplicateMeta && recentMessages.some((m) => m.text.toLowerCase().includes(duplicateMeta.text.slice(0, 20).toLowerCase()))) {
    reasons.push('Recent message references similar content; favour append');
    return {
      label: 'entry_append',
      confidence: 0.8,
      reasons,
      targetEntryId: duplicateMeta.id,
      targetEntryType: mapKindToEntryType(duplicateMeta.kind),
      duplicateMatch: duplicateMeta,
      topCandidates: [
        baseCandidate('entry_append', 0.8),
        baseCandidate('entry_discuss', 0.7),
        baseCandidate('conversational', 0.65),
      ],
    };
  }

  const conversationalConfidence = isQuestion ? 0.9 : 0.82;
  if (isQuestion) reasons.push('Question format leaning conversational');
  else reasons.push('Defaulting to reflective conversational mode');

  return {
    label: 'conversational',
    confidence: conversationalConfidence,
    reasons,
    targetEntryId: contextSnapshot?.isActive ? contextSnapshot.entryId : null,
    targetEntryType: contextSnapshot?.entryType ?? null,
    duplicateMatch: duplicateMeta,
    topCandidates: [
      baseCandidate('conversational', conversationalConfidence),
      baseCandidate('search_query', isQuestion ? 0.58 : 0.4),
      baseCandidate('entry_create', 0.35),
    ],
  };
}

export function toNativeLabel(label: RiflettIntentLabel): string {
  return toTitleCase(label.replace(/_/g, ' '));
}
