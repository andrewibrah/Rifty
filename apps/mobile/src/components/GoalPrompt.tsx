import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { getColors, spacing, radii, typography } from '../theme'
import { useTheme } from '../contexts/ThemeContext'

interface GoalPromptProps {
  goalTitle: string
  goalDescription?: string
  microSteps?: string[]
  onCreateGoal: () => void
  onDismiss: () => void
}

export default function GoalPrompt({
  goalTitle,
  goalDescription,
  microSteps,
  onCreateGoal,
  onDismiss,
}: GoalPromptProps) {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Goal Detected</Text>
      </View>
      <Text style={styles.title}>{goalTitle}</Text>
      {goalDescription && (
        <Text style={styles.description}>{goalDescription}</Text>
      )}
      {microSteps && microSteps.length > 0 && (
        <View style={styles.stepsContainer}>
          <Text style={styles.stepsLabel}>First Steps:</Text>
          {microSteps.slice(0, 3).map((step, idx) => (
            <Text key={idx} style={styles.step}>
              • {step}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={onDismiss}>
          <Text style={styles.buttonSecondaryText}>Not Now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonPrimary} onPress={onCreateGoal}>
          <Text style={styles.buttonPrimaryText}>Create Goal</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.accent + '40',
    },
    header: {
      marginBottom: spacing.sm,
    },
    label: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    description: {
      ...typography.body,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    stepsContainer: {
      marginBottom: spacing.md,
    },
    stepsLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: spacing.xs,
    },
    step: {
      ...typography.small,
      color: colors.textSecondary,
      marginLeft: spacing.sm,
      marginBottom: spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'flex-end',
    },
    buttonPrimary: {
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
    },
    buttonPrimaryText: {
      ...typography.button,
      color: '#fff',
      fontWeight: '600',
    },
    buttonSecondary: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.textTertiary,
    },
    buttonSecondaryText: {
      ...typography.button,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  })
