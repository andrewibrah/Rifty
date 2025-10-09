import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native'
import { getColors, spacing, radii, typography } from '../../../theme'
import { useTheme } from '../../../contexts/ThemeContext'
import type { PersonalizationMode } from '../../../types/personalization'

interface IntroStepProps {
  mode: PersonalizationMode
  localCacheEnabled: boolean
  consentAccepted: boolean
  onModeChange: (mode: PersonalizationMode) => void
  onConsentChange: (consented: boolean) => void
  onCacheToggle: (enabled: boolean) => void
}

const IntroStep: React.FC<IntroStepProps> = ({
  mode,
  localCacheEnabled,
  consentAccepted,
  onModeChange,
  onConsentChange,
  onCacheToggle,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View>
      <Text style={styles.heading}>Personalize Riflett</Text>
      <Text style={styles.body}>
        Choose how much context you want Riflett to remember. We collect only the
        signals you approve so reflections stay helpful, private, and adaptive.
      </Text>

      <View style={styles.cardGroup}>
        <TouchableOpacity
          accessibilityRole="radio"
          accessibilityState={{ selected: mode === 'basic' }}
          onPress={() => onModeChange('basic')}
          style={[styles.modeCard, mode === 'basic' && styles.modeCardActive]}
        >
          <Text style={styles.modeTitle}>Basic personalization</Text>
          <Text style={styles.modeBody}>
            Quick setup. Collects rhythm and tone only. Ideal if you prefer minimal
            storage.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="radio"
          accessibilityState={{ selected: mode === 'full' }}
          onPress={() => onModeChange('full')}
          style={[styles.modeCard, mode === 'full' && styles.modeCardActive]}
        >
          <Text style={styles.modeTitle}>Full personalization</Text>
          <Text style={styles.modeBody}>
            Deeper context for smarter guidance: goals, working style, tone, and
            anchors.
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleTitle}>Local-first cache</Text>
          <Text style={styles.toggleBody}>Store a copy on device for offline safety.</Text>
        </View>
        <Switch value={localCacheEnabled} onValueChange={onCacheToggle} />
      </View>

      <View style={styles.consentCard}>
        <View style={styles.consentHeader}>
          <View style={styles.consentText}>
            <Text style={styles.consentTitle}>Consent & transparency</Text>
            <Text style={styles.consentBody}>
              We store settings in Supabase (encrypted at rest) and locally if enabled. No
              biometric, financial, or health diagnoses collected.
            </Text>
          </View>
          <Switch
            value={consentAccepted}
            onValueChange={onConsentChange}
            trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
            thumbColor={consentAccepted ? '#fff' : colors.textTertiary}
          />
        </View>
        <Text style={[styles.consentStatus, consentAccepted && styles.consentStatusActive]}>
          {consentAccepted ? '✓ Consent granted. You can revoke in settings.' : 'Tap toggle to confirm you understand.'}
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
      marginBottom: spacing.lg,
    },
    cardGroup: {
      marginBottom: spacing.md,
    },
    modeCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    modeCardActive: {
      borderColor: colors.accent,
    },
    modeTitle: {
      fontFamily: typography.title.fontFamily,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    modeBody: {
      fontFamily: typography.body.fontFamily,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    toggleRow: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleText: {
      flex: 1,
      marginRight: spacing.md,
    },
    toggleTitle: {
      fontFamily: typography.body.fontFamily,
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    toggleBody: {
      fontFamily: typography.caption.fontFamily,
      color: colors.textSecondary,
      fontSize: 13,
    },
    consentCard: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    consentHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: spacing.sm,
    },
    consentText: {
      flex: 1,
      marginRight: spacing.md,
    },
    consentTitle: {
      fontFamily: typography.title.fontFamily,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
      fontWeight: '600',
    },
    consentBody: {
      fontFamily: typography.caption.fontFamily,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    consentStatus: {
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
      fontStyle: 'italic',
    },
    consentStatusActive: {
      color: colors.accent,
      fontWeight: '600',
    },
  })

export default IntroStep
