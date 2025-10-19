export type PersonalizationMode = "basic" | "full";

export type ReflectionCadence = "none" | "daily" | "weekly";

export type GoalKey =
  | "health"
  | "relationships"
  | "career"
  | "execution"
  | "performance"
  | "creativity"
  | "mindfulness"
  | "learning"
  | string; // Allow custom goals as strings

export interface LearningStyle {
  visual: number;
  auditory: number;
  kinesthetic: number;
}

export type LanguageIntensity = "soft" | "neutral" | "direct";

export interface DriftRule {
  enabled: boolean;
  after: string | null;
}

export interface UserSettings {
  user_id?: string;
  personalization_mode: PersonalizationMode;
  local_cache_enabled: boolean;
  cadence: ReflectionCadence;
  goals: GoalKey[];
  extra_goal?: string | null;
  // custom_goals: string[];
  learning_style: LearningStyle;
  session_length_minutes: 10 | 25 | 45;
  spiritual_prompts: boolean;
  bluntness: number;
  language_intensity: LanguageIntensity;
  logging_format: "freeform" | "structured" | "mixed";
  drift_rule: DriftRule;
  crisis_card?: string | null;
  persona_tag: PersonaTag;
  checkin_notifications?: boolean;
  missed_day_notifications?: boolean;
  updated_at?: string;
  created_at?: string;
}

export type PersonaTag =
  | "Architect"
  | "Explorer"
  | "Anchor"
  | "Accelerator"
  | "Generalist";

export interface PersonalizationBundle {
  profile: ProfileSnapshot;
  settings: UserSettings | null;
}

export interface ProfileSnapshot {
  id: string;
  timezone: string;
  onboarding_completed: boolean;
  updated_at: string | null;
  missed_day_count?: number;
  current_streak?: number;
  last_message_at?: string | null;
}

export interface PersonaSignalPayload {
  source: "onboarding" | "settings_update";
  rationale: string;
  changes: Record<string, any>;
}

export interface PersonalizationState
  extends Omit<UserSettings, "persona_tag"> {
  persona_tag?: PersonaTag;
}

export interface CachedPersonalization {
  settings: UserSettings;
  updated_at: string;
}
