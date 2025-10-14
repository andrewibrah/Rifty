import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { IntentReviewTicket } from "../../hooks/useChatState";
import { allIntentDefinitions, getIntentById } from "../../constants/intents";
import type { AppIntent } from "../../constants/intents";
import { logIntentAudit } from "../../services/data";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface IntentReviewModalProps {
  visible: boolean;
  review: IntentReviewTicket | null;
  onClose: () => void;
  onConfirm: (
    messageId: string,
    correctIntent: string,
    displayLabel?: string
  ) => void;
}

const IntentReviewModal: React.FC<IntentReviewModalProps> = ({
  visible,
  review,
  onClose,
  onConfirm,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = createStyles(colors);

  const [customIntentValue, setCustomIntentValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!review) return null;

  const predictedDefinition = getIntentById(review.intent.id as AppIntent);

  const handleSubmitFeedback = async (
    correctIntent: string,
    displayLabel?: string
  ) => {
    setIsSubmitting(true);
    try {
      await logIntentAudit({
        entryId: review.messageId,
        prompt: review.content,
        predictedIntent: review.intent.id,
        correctIntent,
      });

      onConfirm(review.messageId, correctIntent, displayLabel);
      setCustomIntentValue("");
      onClose();
    } catch (error) {
      console.error("[IntentReviewModal] Failed to submit feedback", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCustomIntent = () => {
    const value = customIntentValue.trim();
    if (!value) return;
    const customId = `custom:${Date.now()}`;
    handleSubmitFeedback(customId, value);
  };

  const handleSkip = () => {
    handleSubmitFeedback("unknown");
  };

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <SafeAreaView style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Confirm Intent</Text>
          <Text style={styles.message}>"{review.content}"</Text>

          <View style={styles.predictedBox}>
            <Text style={styles.predictedLabel}>PREDICTED</Text>
            <Text style={styles.predictedValue}>
              {predictedDefinition.label}
            </Text>
            <Text style={styles.predictedConfidence}>
              {Math.round(review.intent.confidence * 100)}% confidence
            </Text>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.confirmButton,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={() => handleSubmitFeedback(review.intent.id)}
              disabled={isSubmitting}
            >
              <Text style={styles.actionButtonText}>✓ Correct</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.optionsHeader}>Or select different intent</Text>
          <ScrollView
            style={styles.optionsList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {allIntentDefinitions
              .filter((definition) => definition.id !== review.intent.id)
              .map((definition) => (
                <TouchableOpacity
                  key={definition.id}
                  style={styles.optionRow}
                  onPress={() => handleSubmitFeedback(definition.id)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.optionLabel}>{definition.label}</Text>
                  <Text style={styles.optionMeta}>
                    {definition.subsystem.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>

          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={customIntentValue}
              onChangeText={setCustomIntentValue}
              placeholder="Custom intent..."
              placeholderTextColor={colors.textTertiary}
            />
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.submitButton,
                (isSubmitting || !customIntentValue.trim()) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleSubmitCustomIntent}
              disabled={isSubmitting || !customIntentValue.trim()}
            >
              <Text style={styles.actionButtonText}>Submit</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.skipButton, isSubmitting && styles.buttonDisabled]}
            onPress={handleSkip}
            disabled={isSubmitting}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.95)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    card: {
      width: "100%",
      maxWidth: 400,
      maxHeight: "85%",
      backgroundColor: colors.background,
      borderRadius: radii.lg,
      padding: spacing.xl,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    title: {
      ...typography.title,
      fontSize: 22,
      fontWeight: "700",
      color: "#FFFFFF",
      marginBottom: spacing.md,
      textAlign: "center",
    },
    message: {
      ...typography.body,
      fontSize: 15,
      color: "#E0E0E0",
      marginBottom: spacing.lg,
      lineHeight: 22,
      textAlign: "center",
    },
    predictedBox: {
      padding: spacing.lg,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.accent,
      marginBottom: spacing.xl,
      alignItems: "center",
    },
    predictedLabel: {
      ...typography.caption,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: "#FFFFFF",
      marginBottom: spacing.sm,
    },
    predictedValue: {
      ...typography.title,
      fontSize: 20,
      fontWeight: "700",
      color: "#FFFFFF",
      marginBottom: spacing.xs,
    },
    predictedConfidence: {
      ...typography.caption,
      fontSize: 12,
      color: "#E0E0E0",
      marginBottom: spacing.md,
    },
    actionButton: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.lg,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    buttonDisabled: {
      opacity: 0.4,
    },
    confirmButton: {
      backgroundColor: colors.accent,
      borderWidth: 0,
    },
    submitButton: {
      backgroundColor: colors.accent,
      flexShrink: 0,
      paddingHorizontal: spacing.xl,
    },
    actionButtonText: {
      ...typography.button,
      fontSize: 16,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    optionsHeader: {
      ...typography.caption,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
      color: "#B0B0B0",
      marginBottom: spacing.md,
      marginTop: spacing.sm,
    },
    optionsList: {
      maxHeight: 200,
      marginBottom: spacing.lg,
    },
    optionRow: {
      padding: spacing.md,
      borderRadius: radii.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionLabel: {
      ...typography.body,
      fontSize: 16,
      fontWeight: "600",
      color: "#FFFFFF",
      marginBottom: 4,
    },
    optionMeta: {
      ...typography.caption,
      fontSize: 12,
      fontWeight: "500",
      color: "#B0B0B0",
    },
    customRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    customInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: 15,
      color: "#FFFFFF",
      backgroundColor: colors.surface,
      minHeight: 48,
    },
    skipButton: {
      alignItems: "center",
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    skipText: {
      ...typography.caption,
      fontSize: 14,
      color: "#808080",
      textDecorationLine: "underline",
    },
  });

export default IntentReviewModal;
