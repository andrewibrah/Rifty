import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native'
import { getColors, spacing, radii, typography } from '../../../theme'
import { useTheme } from '../../../contexts/ThemeContext'
import type {
  LanguageIntensity,
  PersonalizationMode,
  PersonalizationState,
} from '../../../types/personalization'

interface ToneStepProps {
  bluntness: number
  languageIntensity: LanguageIntensity
  loggingFormat: PersonalizationState['logging_format']
  spiritualPrompts: boolean
  mode: PersonalizationMode
  onUpdate: (patch: Partial<PersonalizationState>) => void
}

const intensityOptions: LanguageIntensity[] = ['soft', 'neutral', 'direct']
const loggingOptions: PersonalizationState['logging_format'][] = ['freeform', 'structured', 'mixed']
const bluntnessValues = Array.from({ length: 10 }, (_, idx) => idx + 1)

const ToneStep: React.FC<ToneStepProps> = ({
  bluntness,
  languageIntensity,
  loggingFormat,
  spiritualPrompts,
  mode,
  onUpdate,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View>
      <Text style={styles.heading}>Tone & boundaries</Text>
      <Text style={styles.body}>
        Calibrate how warm, direct, or structured Reflectify should be when it responds to
        your reflections.
      </Text>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.label}>Spiritual prompts</Text>
            <Text style={styles.helper}>Enable references to gratitude, meaning, or faith.</Text>
          </View>
          <Switch
            value={spiritualPrompts}
            onValueChange={(value) => onUpdate({ spiritual_prompts: value })}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Bluntness level (1 gentle – 10 straight to the point)</Text>
        <View style={styles.sliderRow}>
          {bluntnessValues.map((value) => {
            const active = bluntness === value
            return (
              <TouchableOpacity
                key={value}
                style={[styles.sliderDot, active && styles.sliderDotActive]}
                onPress={() => onUpdate({ bluntness: value })}
                accessibilityRole="adjustable"
              >
                <Text style={[styles.sliderValue, active && styles.sliderValueActive]}>{value}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Language intensity</Text>
        <View style={styles.rowWrap}>
          {intensityOptions.map((option) => {
            const active = option === languageIntensity
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onUpdate({ language_intensity: option })}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {option === 'soft' ? 'Soft' : option === 'neutral' ? 'Neutral' : 'Direct'}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Logging format</Text>
        <View style={styles.rowWrap}>
          {loggingOptions.map((option) => {
            const active = option === loggingFormat
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onUpdate({ logging_format: option })}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {option === 'freeform'
                    ? 'Freeform'
                    : option === 'structured'
                      ? 'Structured'
                      : 'Mixed'}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {mode === 'basic' && (
          <Text style={styles.helper}>Basic mode keeps tone simpler but still honors these preferences.</Text>
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
      padding: spacing.md,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    toggleCopy: {
      flex: 1,
      marginRight: spacing.sm,
    },
    label: {
      fontFamily: typography.title.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    helper: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: spacing.sm,
    },
    sliderRow: {
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
    rowWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
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
    chipLabel: {
      fontFamily: typography.body.fontFamily,
      color: colors.textSecondary,
    },
    chipLabelActive: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
  })

export default ToneStep
