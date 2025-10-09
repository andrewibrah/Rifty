import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { getColors, spacing, radii, typography } from '../../../theme'
import { useTheme } from '../../../contexts/ThemeContext'
import type { PersonalizationMode, PersonalizationState } from '../../../types/personalization'

interface WorkingStyleStepProps {
  learningStyle: PersonalizationState['learning_style']
  sessionLength: PersonalizationState['session_length_minutes']
  mode: PersonalizationMode
  onLearningStyleChange: (style: PersonalizationState['learning_style']) => void
  onSessionLengthChange: (value: PersonalizationState['session_length_minutes']) => void
}

const sliderValues = Array.from({ length: 11 }, (_, idx) => idx)
const sessionOptions: PersonalizationState['session_length_minutes'][] = [10, 25, 45]

const WorkingStyleStep: React.FC<WorkingStyleStepProps> = ({
  learningStyle,
  sessionLength,
  mode,
  onLearningStyleChange,
  onSessionLengthChange,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  const renderSlider = (label: string, value: number, key: keyof PersonalizationState['learning_style']) => (
    <View style={styles.sliderBlock}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.sliderTrack}>
        {sliderValues.map((option) => {
          const active = option === value
          return (
            <TouchableOpacity
              key={option}
              accessibilityRole="adjustable"
              onPress={() => onLearningStyleChange({ ...learningStyle, [key]: option })}
              style={[styles.sliderDot, active && styles.sliderDotActive]}
            >
              <Text style={[styles.sliderValue, active && styles.sliderValueActive]}>{option}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )

  return (
    <View>
      <Text style={styles.heading}>Working style</Text>
      <Text style={styles.body}>
        Gauge how you process information. Reflectify blends prompts to match your sensory
        cues and focus span.
      </Text>

      <View style={styles.card}>
        {renderSlider('Visual cues', learningStyle.visual, 'visual')}
        {renderSlider('Auditory cues', learningStyle.auditory, 'auditory')}
        {renderSlider('Kinesthetic cues', learningStyle.kinesthetic, 'kinesthetic')}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Preferred session length</Text>
        <View style={styles.sessionRow}>
          {sessionOptions.map((option) => {
            const active = sessionLength === option
            return (
              <TouchableOpacity
                key={option}
                style={[styles.sessionChip, active && styles.sessionChipActive]}
                onPress={() => onSessionLengthChange(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.sessionText, active && styles.sessionTextActive]}>{`${option} min`}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {mode === 'basic' && (
          <Text style={styles.helper}>Basic mode stores only your top slider values.</Text>
        )}
      </View>
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
    card: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    sliderBlock: {
      marginBottom: spacing.md,
    },
    sliderLabel: {
      fontFamily: typography.title.fontFamily,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    sliderTrack: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    sliderDot: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginRight: spacing.xs,
      marginBottom: spacing.xs,
    },
    sliderDotActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surface,
    },
    sliderValue: {
      fontFamily: typography.caption.fontFamily,
      color: colors.textSecondary,
      fontSize: 12,
    },
    sliderValueActive: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    label: {
      fontFamily: typography.title.fontFamily,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    sessionRow: {
      flexDirection: 'row',
    },
    sessionChip: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginRight: spacing.sm,
    },
    sessionChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surface,
    },
    sessionText: {
      fontFamily: typography.body.fontFamily,
      color: colors.textSecondary,
    },
    sessionTextActive: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    helper: {
      marginTop: spacing.sm,
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
    },
  })

export default WorkingStyleStep
