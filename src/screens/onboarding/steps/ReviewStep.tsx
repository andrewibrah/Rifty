import React from 'react'
import { View, Text, StyleSheet, Switch } from 'react-native'
import { getColors, spacing, radii, typography } from '@/theme'
import { useTheme } from '@/contexts/ThemeContext'
import type { PersonalizationState } from '@/types/personalization'

interface ReviewStepProps {
  state: PersonalizationState
  timezone: string
  confirmed: boolean
  onConfirmChange: (value: boolean) => void
}

const ReviewStep: React.FC<ReviewStepProps> = ({ state, timezone, confirmed, onConfirmChange }) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View>
      <Text style={styles.heading}>Review & confirm</Text>
      <Text style={styles.body}>
        Here is the context Riflett will keep. You can edit or export everything later
        in Settings → Personalization.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Identity</Text>
        <Text style={styles.item}>{`Timezone: ${timezone}`}</Text>
        <Text style={styles.item}>{`Cadence: ${state.cadence}`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Goals & style</Text>
        <Text style={styles.item}>{`Goals: ${state.goals.length ? state.goals.join(', ') : 'None'}`}</Text>
        {state.extra_goal ? <Text style={styles.item}>{`Extra: ${state.extra_goal}`}</Text> : null}
        <Text style={styles.item}>{`Session length: ${state.session_length_minutes} minutes`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tone</Text>
        <Text style={styles.item}>{`Bluntness: ${state.bluntness}`}</Text>
        <Text style={styles.item}>{`Language: ${state.language_intensity}`}</Text>
        <Text style={styles.item}>{`Logging: ${state.logging_format}`}</Text>
        <Text style={styles.item}>{`Spiritual prompts: ${state.spiritual_prompts ? 'On' : 'Off'}`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Safeties</Text>
        <Text style={styles.item}>
          {`2-step anchor: ${state.drift_rule.enabled ? `After ${state.drift_rule.after ?? '00:45'}` : 'Off'}`}
        </Text>
        <Text style={styles.item}>{`Crisis note: ${state.crisis_card ? 'Stored' : 'Not set'}`}</Text>
      </View>

      <View style={styles.confirmRow}>
        <Switch value={confirmed} onValueChange={onConfirmChange} />
        <Text style={styles.confirmCopy}>
          I understand how my data is used and stored across Supabase + local cache.
        </Text>
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
    cardTitle: {
      fontFamily: typography.title.fontFamily,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    item: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    confirmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    confirmCopy: {
      flex: 1,
      fontFamily: typography.caption.fontFamily,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginLeft: spacing.sm,
    },
  })

export default ReviewStep
