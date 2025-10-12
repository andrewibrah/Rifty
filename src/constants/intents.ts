import type { EntryType } from "../services/data";

export type RawIntentLabel =
  | "Journal Entry"
  | "Goal Create"
  | "Search Info"
  | "Crisis Flag"
  | "Schedule Create"
  | "Reflection Request"
  | "Spaces"
  | "Insight Link"
  | "Reminder Set"
  | "Pattern Summarize"
  | "Bug Feedback"
  | "Goal Check-in"
  | "Data Export"
  | "Settings Change"
  | "Small Talk"
  | "Wellness Check"
  | "label"
  | string;

export type AppIntent =
  | "journal_entry"
  | "goal_create"
  | "goal_check_in"
  | "schedule_create"
  | "reminder_set"
  | "reflection_request"
  | "insight_link"
  | "search_info"
  | "spaces"
  | "pattern_summarize"
  | "bug_feedback"
  | "data_export"
  | "settings_change"
  | "small_talk"
  | "wellness_check"
  | "crisis_flag"
  | "unknown";

export type IntentSubsystem = "entries" | "goals" | "schedule" | "user_config" | "support" | "knowledge";

export interface IntentDefinition {
  id: AppIntent;
  label: RawIntentLabel;
  subsystem: IntentSubsystem;
  entryType?: EntryType;
  allowedInEntryChat: boolean;
}

const definitions: IntentDefinition[] = [
  {
    id: "journal_entry",
    label: "Journal Entry",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "goal_create",
    label: "Goal Create",
    subsystem: "goals",
    entryType: "goal",
    allowedInEntryChat: false,
  },
  {
    id: "goal_check_in",
    label: "Goal Check-in",
    subsystem: "goals",
    entryType: "goal",
    allowedInEntryChat: false,
  },
  {
    id: "schedule_create",
    label: "Schedule Create",
    subsystem: "schedule",
    entryType: "schedule",
    allowedInEntryChat: false,
  },
  {
    id: "reminder_set",
    label: "Reminder Set",
    subsystem: "schedule",
    entryType: "schedule",
    allowedInEntryChat: false,
  },
  {
    id: "reflection_request",
    label: "Reflection Request",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "insight_link",
    label: "Insight Link",
    subsystem: "knowledge",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "search_info",
    label: "Search Info",
    subsystem: "knowledge",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "spaces",
    label: "Spaces",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "pattern_summarize",
    label: "Pattern Summarize",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "bug_feedback",
    label: "Bug Feedback",
    subsystem: "support",
    allowedInEntryChat: true,
  },
  {
    id: "data_export",
    label: "Data Export",
    subsystem: "user_config",
    allowedInEntryChat: false,
  },
  {
    id: "settings_change",
    label: "Settings Change",
    subsystem: "user_config",
    allowedInEntryChat: false,
  },
  {
    id: "small_talk",
    label: "Small Talk",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "wellness_check",
    label: "Wellness Check",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "crisis_flag",
    label: "Crisis Flag",
    subsystem: "support",
    allowedInEntryChat: true,
  },
];

const lookup = new Map(
  definitions.map((definition) => [definition.label.toLowerCase(), definition])
);

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

const DEFAULT_INTENT: IntentDefinition = {
  id: "journal_entry",
  label: "Journal Entry",
  subsystem: "entries",
  entryType: "journal",
  allowedInEntryChat: true,
};

export function getIntentDefinition(label: string): IntentDefinition {
  const trimmed = label.trim();
  const normalized = trimmed.toLowerCase();
  const safeLabel = normalized === "" || normalized === "label" ? "journal entry" : normalized;
  const match = lookup.get(safeLabel);

  if (match) {
    return match;
  }

  return {
    ...DEFAULT_INTENT,
    id: "unknown",
    label: trimmed || DEFAULT_INTENT.label,
  };
}

export function getIntentById(intent: AppIntent): IntentDefinition {
  return byId.get(intent) ?? {
    ...DEFAULT_INTENT,
    id: intent,
    label: intent,
  };
}

export const entryChatAllowedIntents = definitions
  .filter((definition) => definition.allowedInEntryChat)
  .map((definition) => definition.id);

export const allIntentDefinitions = definitions;
