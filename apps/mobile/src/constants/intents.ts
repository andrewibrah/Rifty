import type { EntryType } from "@shared/types/entries";
import type {
  AppIntent,
  IntentDefinition,
  IntentSubsystem,
  RawIntentLabel,
} from "@shared/types/intent";

export type {
  AppIntent,
  IntentDefinition,
  IntentSubsystem,
  RawIntentLabel,
};

const definitions: IntentDefinition[] = [
  {
    id: "conversational",
    label: "Conversational",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "entry_create",
    label: "Entry Create",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: false,
  },
  {
    id: "entry_discuss",
    label: "Entry Discuss",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "entry_append",
    label: "Entry Append",
    subsystem: "entries",
    entryType: "journal",
    allowedInEntryChat: true,
  },
  {
    id: "command",
    label: "Command",
    subsystem: "user_config",
    allowedInEntryChat: false,
  },
  {
    id: "search_query",
    label: "Search Query",
    subsystem: "knowledge",
    allowedInEntryChat: true,
  },
];

const lookup = new Map(
  definitions.map((definition) => [definition.label.toLowerCase(), definition])
);

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

const DEFAULT_INTENT: IntentDefinition = {
  id: "conversational",
  label: "Conversational",
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
