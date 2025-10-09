import React from 'react'
import { View, Text, StyleSheet, Switch, TextInput } from 'react-native'
import { getColors, spacing, radii, typography } from '../../../theme'
import { useTheme } from '../../../contexts/ThemeContext'
import type { DriftRule, PersonalizationMode } from '../../../types/personalization'

interface AnchorsStepProps {
  driftRule: DriftRule
  crisisCard: string
  mode: PersonalizationMode
  onDriftRuleChange: (value: DriftRule) => void
  onCrisisCardChange: (value: string) => void
}

const AnchorsStep: React.FC<AnchorsStepProps> = ({
  driftRule,
  crisisCard,
  mode,
  onDriftRuleChange,
  onCrisisCardChange,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View>
      <Text style={styles.heading}>Anchors & safeties</Text>
      <Text style={styles.body}>
        Define gentle guardrails for future-you. Reflectify surfaces them only when the
        pattern fits.
      </Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.label}>2-step anchor rule</Text>
            <Text style={styles.helper}>
              When drift happens after a set time, Reflectify will remind you to pause,
              breathe, and refocus.
            </Text>
          </View>
          <Switch
            value={driftRule.enabled}
            onValueChange={(value) => onDriftRuleChange({ ...driftRule, enabled: value })}
          />
        </View>
        {driftRule.enabled && (
          <TextInput
            style={styles.input}
            placeholder="Trigger after HH:MM (e.g. 00:45)"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numbers-and-punctuation"
            value={driftRule.after ?? ''}
            onChangeText={(value) => onDriftRuleChange({ ...driftRule, after: value })}
          />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Optional crisis note</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          multiline
          numberOfLines={4}
          placeholder="If things feel unsafe, remind me to..."
          placeholderTextColor={colors.textTertiary}
          value={crisisCard}
          onChangeText={onCrisisCardChange}
        />
        <Text style={styles.helper}>
          Stored privately. Only you and Reflectify see this.
        </Text>
        {mode === 'basic' && (
          <Text style={styles.helper}>Basic mode keeps this note offline when local cache is enabled.</Text>
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
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    copy: {
      flex: 1,
      marginRight: spacing.sm,
    },
    label: {
      fontFamily: typography.title.fontFamily,
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: spacing.xs,
    },
    helper: {
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
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
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
  })

export default AnchorsStep
