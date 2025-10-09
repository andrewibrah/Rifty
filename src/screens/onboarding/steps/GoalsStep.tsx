import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native'
import { getColors, spacing, radii, typography } from '../../../theme'
import { useTheme } from '../../../contexts/ThemeContext'
import type { GoalKey, PersonalizationMode } from '../../../types/personalization'

interface GoalsStepProps {
  selectedGoals: GoalKey[]
  goalOptions: GoalKey[]
  extraGoal: string
  mode: PersonalizationMode
  onGoalsChange: (goals: GoalKey[]) => void
  onExtraGoalChange: (value: string) => void
}

const prettyGoal = (goal: GoalKey) => {
  switch (goal) {
    case 'execution':
      return 'Execution'
    case 'performance':
      return 'Performance'
    case 'mindfulness':
      return 'Mindfulness'
    case 'learning':
      return 'Learning'
    case 'relationships':
      return 'Relationships'
    case 'career':
      return 'Career Growth'
    case 'creativity':
      return 'Creativity'
    case 'health':
    default:
      return 'Health & Energy'
  }
}

const GoalsStep: React.FC<GoalsStepProps> = ({
  selectedGoals,
  goalOptions,
  extraGoal,
  mode,
  onGoalsChange,
  onExtraGoalChange,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  const toggleGoal = (goal: GoalKey) => {
    if (selectedGoals.includes(goal)) {
      onGoalsChange(selectedGoals.filter((item) => item !== goal))
    } else {
      if (selectedGoals.length >= 3) return
      onGoalsChange([...selectedGoals, goal])
    }
  }

  return (
    <View>
      <Text style={styles.heading}>Goals snapshot</Text>
      <Text style={styles.body}>
        Tag what success looks like right now. Reflectify spots patterns across these
        themes.
      </Text>

      <View style={styles.chipGroup}>
        {goalOptions.map((goal) => {
          const active = selectedGoals.includes(goal)
          return (
            <TouchableOpacity
              key={goal}
              style={[styles.chip, active && styles.chipActive, selectedGoals.length >= 3 && !active && styles.chipDisabled]}
              onPress={() => toggleGoal(goal)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityHint="Select up to three goals"
              disabled={!active && selectedGoals.length >= 3}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{prettyGoal(goal)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={styles.extraCard}>
        <Text style={styles.label}>Add your own</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional focus (e.g. launch, parenting)"
          placeholderTextColor={colors.textTertiary}
          value={extraGoal}
          onChangeText={onExtraGoalChange}
        />
      </View>

      {mode === 'basic' && (
        <Text style={styles.helper}>
          In Basic mode, we only track these high-level tags. Switch to Full anytime in
          Settings → Personalization.
        </Text>
      )}
    </View>
  )
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    heading: {
      fontFamily: typography.title.fontFamily,
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    body: {
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    chipGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: spacing.md,
    },
    chip: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginRight: spacing.sm,
      marginBottom: spacing.sm,
    },
    chipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surface,
    },
    chipDisabled: {
      opacity: 0.4,
    },
    chipLabel: {
      fontFamily: typography.body.fontFamily,
      color: colors.textSecondary,
    },
    chipLabelActive: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    extraCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      backgroundColor: colors.surface,
    },
    label: {
      fontFamily: typography.title.fontFamily,
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: spacing.xs,
    },
    input: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontFamily: typography.body.fontFamily,
      color: colors.textPrimary,
      fontSize: 15,
    },
    helper: {
      marginTop: spacing.md,
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
    },
  })

export default GoalsStep
