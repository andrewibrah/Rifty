import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { getColors, spacing, radii, typography } from "../../theme";
import type {
  PersonalizationState,
  PersonaTag,
  PersonalizationMode,
  ReflectionCadence,
  GoalKey,
  LanguageIntensity,
  UserSettings,
} from "../../types/personalization";
import IntroStep from "./steps/IntroStep";
import IdentityStep from "./steps/IdentityStep";
import GoalsStep from "./steps/GoalsStep";
import WorkingStyleStep from "./steps/WorkingStyleStep";
import ToneStep from "./steps/ToneStep";
import AnchorsStep from "./steps/AnchorsStep";
import ReviewStep from "./steps/ReviewStep";

const GOAL_OPTIONS: GoalKey[] = [
  "health",
  "relationships",
  "career",
  "execution",
  "performance",
  "creativity",
  "mindfulness",
  "learning",
];

export interface OnboardingFlowProps {
  initialSettings?: UserSettings | null;
  initialTimezone: string;
  onPersist: (
    state: PersonalizationState,
    timezone: string
  ) => Promise<PersonaTag>;
  onComplete: (persona: PersonaTag) => void;
}

const defaultState: PersonalizationState = {
  personalization_mode: "full",
  local_cache_enabled: true,
  cadence: "daily",
  goals: [],
  extra_goal: null,
  // custom_goals: [],
  learning_style: { visual: 5, auditory: 5, kinesthetic: 5 },
  session_length_minutes: 25,
  spiritual_prompts: false,
  bluntness: 5,
  language_intensity: "neutral",
  logging_format: "mixed",
  drift_rule: { enabled: false, after: null },
  crisis_card: null,
  checkin_notifications: true,
  missed_day_notifications: true,
};

const STEPS = 7;

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialSettings,
  initialTimezone,
  onPersist,
  onComplete,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const mergedInitial: PersonalizationState = {
    ...defaultState,
    ...(initialSettings ?? {}),
  };

  const [state, setState] = useState<PersonalizationState>(mergedInitial);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [step, setStep] = useState(0);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mode = state.personalization_mode;

  const handleUpdate = (patch: Partial<PersonalizationState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const canAdvance = () => {
    if (step === 0) return consentAccepted;
    if (step === STEPS - 1) return reviewConfirmed;
    return true;
  };

  const handleNext = () => {
    if (step < STEPS - 1) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    if (step < STEPS - 1) {
      setStep((prev) => prev + 1);
    }
  };

  const handleFinish = async () => {
    if (!canAdvance()) return;
    setIsSubmitting(true);
    try {
      const persona = await onPersist(state, timezone);
      onComplete(persona);
    } catch (error) {
      Alert.alert(
        "Save failed",
        "We could not save your personalization yet. Please try again."
      );
      console.error("Failed to persist onboarding state", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <IntroStep
            mode={mode}
            localCacheEnabled={state.local_cache_enabled}
            consentAccepted={consentAccepted}
            onModeChange={(value: PersonalizationMode) =>
              handleUpdate({ personalization_mode: value })
            }
            onConsentChange={setConsentAccepted}
            onCacheToggle={(enabled) =>
              handleUpdate({ local_cache_enabled: enabled })
            }
          />
        );
      case 1:
        return (
          <IdentityStep
            timezone={timezone}
            onTimezoneChange={setTimezone}
            cadence={state.cadence}
            onCadenceChange={(value: ReflectionCadence) =>
              handleUpdate({ cadence: value })
            }
            mode={mode}
          />
        );
      case 2:
        return (
          <GoalsStep
            selectedGoals={state.goals}
            onGoalsChange={(goals: GoalKey[]) => handleUpdate({ goals })}
            goalOptions={GOAL_OPTIONS}
            mode={mode}
            extraGoal={state.extra_goal ?? ""}
            onExtraGoalChange={(value) => handleUpdate({ extra_goal: value })}
            // customGoals={state.custom_goals}
            // onCustomGoalsChange={(goals) =>
            //   handleUpdate({ custom_goals: goals })
            // }
          />
        );
      case 3:
        return (
          <WorkingStyleStep
            learningStyle={state.learning_style}
            sessionLength={state.session_length_minutes}
            onLearningStyleChange={(value) =>
              handleUpdate({ learning_style: value })
            }
            onSessionLengthChange={(value) =>
              handleUpdate({
                session_length_minutes:
                  value as PersonalizationState["session_length_minutes"],
              })
            }
            mode={mode}
          />
        );
      case 4:
        return (
          <ToneStep
            bluntness={state.bluntness}
            languageIntensity={state.language_intensity}
            loggingFormat={state.logging_format}
            spiritualPrompts={state.spiritual_prompts}
            onUpdate={(patch) => handleUpdate(patch)}
            mode={mode}
          />
        );
      case 5:
        return (
          <AnchorsStep
            driftRule={state.drift_rule}
            crisisCard={state.crisis_card ?? ""}
            onDriftRuleChange={(value) => handleUpdate({ drift_rule: value })}
            onCrisisCardChange={(value) => handleUpdate({ crisis_card: value })}
            mode={mode}
          />
        );
      case 6:
      default:
        return (
          <ReviewStep
            state={state}
            timezone={timezone}
            confirmed={reviewConfirmed}
            onConfirmChange={setReviewConfirmed}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.progressContainer}>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepNumber}>{step + 1}</Text>
            <Text style={styles.stepTotal}>/{STEPS}</Text>
          </View>
          <Text style={styles.progress}>Progress</Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${((step + 1) / STEPS) * 100}%` },
              ]}
            />
          </View>
        </View>
        <Text style={styles.title}>Personalize Riflett</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        alwaysBounceVertical={false}
      >
        {stepContent()}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <TouchableOpacity
            onPress={handleBack}
            style={[
              styles.secondaryButton,
              step === 0 && styles.disabledButton,
            ]}
            disabled={step === 0}
          >
            <Text style={styles.secondaryText}>Back</Text>
          </TouchableOpacity>
          {step < STEPS - 1 && step !== 0 && (
            <TouchableOpacity
              onPress={handleSkip}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={step === STEPS - 1 ? handleFinish : handleNext}
          style={[
            styles.primaryButton,
            (!canAdvance() || isSubmitting) && styles.disabledButton,
          ]}
          disabled={!canAdvance() || isSubmitting}
        >
          <Text style={styles.primaryText}>
            {step === STEPS - 1 ? "Finish" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      backgroundColor: colors.surface,
      borderBottomWidth: 2,
      borderBottomColor: colors.accent,
      shadowColor: colors.textPrimary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    progressContainer: {
      marginBottom: spacing.lg,
      paddingVertical: spacing.sm,
    },
    stepIndicator: {
      flexDirection: "row",
      alignItems: "baseline",
      marginBottom: spacing.sm,
    },
    stepNumber: {
      fontFamily: typography.heading.fontFamily,
      fontSize: 32,
      fontWeight: "800",
      color: colors.accent,
      lineHeight: 36,
    },
    stepTotal: {
      fontFamily: typography.heading.fontFamily,
      fontSize: 20,
      fontWeight: "600",
      color: colors.textSecondary,
      lineHeight: 24,
    },
    progress: {
      fontFamily: typography.caption.fontFamily,
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: spacing.sm,
      fontWeight: "500",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    progressBar: {
      height: 6,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 3,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.accent,
      borderRadius: 3,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 2,
    },
    title: {
      fontFamily: typography.heading.fontFamily,
      fontSize: 28,
      color: colors.textPrimary,
      fontWeight: "700",
      letterSpacing: -0.5,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl + spacing.xl,
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      shadowColor: colors.textPrimary,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radii.md,
      paddingVertical: spacing.md + spacing.xs,
      alignItems: "center",
      minHeight: 48,
      justifyContent: "center",
    },
    primaryText: {
      color: "#fff",
      fontFamily: typography.button.fontFamily,
      fontWeight: "600",
      fontSize: 16,
    },
    secondaryButton: {
      flex: 1,
      marginRight: spacing.sm,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    secondaryText: {
      fontFamily: typography.button.fontFamily,
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: "500",
    },
    disabledButton: {
      opacity: 0.5,
    },
  });

export default OnboardingFlow;
