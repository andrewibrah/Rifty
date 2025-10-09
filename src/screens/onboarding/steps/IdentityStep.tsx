import React from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native'
import { getColors, spacing, radii, typography } from '../../../theme'
import { useTheme } from '../../../contexts/ThemeContext'
import type { PersonalizationMode, ReflectionCadence } from '../../../types/personalization'

interface IdentityStepProps {
  timezone: string
  cadence: ReflectionCadence
  mode: PersonalizationMode
  onTimezoneChange: (value: string) => void
  onCadenceChange: (value: ReflectionCadence) => void
}

const cadenceOptions: { label: string; value: ReflectionCadence; description: string }[] = [
  { label: 'None', value: 'none', description: 'I will share whenever it feels right.' },
  { label: 'Daily', value: 'daily', description: 'Brief daily check-ins keep me grounded.' },
  { label: 'Weekly', value: 'weekly', description: 'One focused session each week.' },
]

const IdentityStep: React.FC<IdentityStepProps> = ({
  timezone,
  cadence,
  mode,
  onTimezoneChange,
  onCadenceChange,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View>
      <Text style={styles.heading}>Identity & rhythm</Text>
      <Text style={styles.body}>
        Tell Reflectify who is speaking and how often you want gentle check-ins.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional nickname"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          editable={false}
          value="Linked to your account"
        />
        <Text style={styles.helper}>Display name syncs from your auth profile.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Timezone</Text>
        <TextInput
          style={styles.input}
          value={timezone}
          onChangeText={onTimezoneChange}
          placeholder="e.g. America/Chicago"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Timezone"
        />
        <Text style={styles.helper}>Detected automatically—adjust if needed.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Reflection cadence</Text>
        {cadenceOptions.map((option) => {
          const active = cadence === option.value
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onCadenceChange(option.value)}
              style={[styles.cadenceChip, active && styles.cadenceChipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.cadenceLabel, active && styles.cadenceLabelActive]}>
                {option.label}
              </Text>
              <Text style={styles.cadenceDescription}>{option.description}</Text>
            </TouchableOpacity>
          )
        })}
        {mode === 'basic' && (
          <Text style={styles.helper}>Basic mode keeps cadence flexible—you can adjust later.</Text>
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
      color: colors.textSecondary,
      lineHeight: 22,
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
    label: {
      fontFamily: typography.title.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: colors.surface,
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
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
      marginTop: spacing.xs,
    },
    cadenceChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    cadenceChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surface,
    },
    cadenceLabel: {
      fontFamily: typography.body.fontFamily,
      fontWeight: '600',
      color: colors.textSecondary,
      fontSize: 14,
    },
    cadenceLabelActive: {
      color: colors.textPrimary,
    },
    cadenceDescription: {
      marginTop: 4,
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
    },
  })

export default IdentityStep
