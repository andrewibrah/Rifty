import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Share, ScrollView } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { getColors, spacing, radii, typography } from '../../theme'
import type { PersonalizationBundle, PersonalizationState, PersonaTag } from '../../types/personalization'
import OnboardingFlow from '../onboarding/OnboardingFlow'
import { exportPersonalization, deletePersonalization } from '../../services/personalization'

interface PersonalizationSettingsScreenProps {
  bundle: PersonalizationBundle
  onClose: () => void
  onSave: (state: PersonalizationState, timezone: string) => Promise<PersonaTag>
}

const PersonalizationSettingsScreen: React.FC<PersonalizationSettingsScreenProps> = ({
  bundle,
  onClose,
  onSave,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [isEditing, setIsEditing] = useState(false)

  if (isEditing) {
    return (
      <OnboardingFlow
        initialSettings={bundle.settings ?? undefined}
        initialTimezone={bundle.profile.timezone}
        onPersist={(state, timezone) => onSave(state, timezone)}
        onComplete={() => {
          setIsEditing(false)
        }}
      />
    )
  }

  const handleExport = async () => {
    try {
      const payload = await exportPersonalization()
      await Share.share({ message: payload })
    } catch (error) {
      Alert.alert('Export failed', 'Unable to export personalization data right now.')
      console.error('Export personalization', error)
    }
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete personalization?',
      'This removes settings and persona signals. You can redo onboarding later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePersonalization()
            onClose()
          },
        },
      ]
    )
  }

  const settings = bundle.settings

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Personalization</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Persona tag</Text>
        <Text style={styles.bodyText}>{settings?.persona_tag ?? 'Generalist'}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rhythm</Text>
          <Text style={styles.item}>{`Timezone: ${bundle.profile.timezone}`}</Text>
          <Text style={styles.item}>{`Cadence: ${settings?.cadence ?? 'unset'}`}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Goals</Text>
          <Text style={styles.item}>{`Tags: ${settings?.goals?.join(', ') ?? 'None'}`}</Text>
          {settings?.extra_goal ? <Text style={styles.item}>{`Extra: ${settings.extra_goal}`}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tone</Text>
          <Text style={styles.item}>{`Bluntness: ${settings?.bluntness ?? '-'}`}</Text>
          <Text style={styles.item}>{`Language: ${settings?.language_intensity ?? '-'}`}</Text>
          <Text style={styles.item}>{`Logging: ${settings?.logging_format ?? '-'}`}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Safeties</Text>
          <Text style={styles.item}>
            {`Anchor rule: ${settings?.drift_rule?.enabled ? `After ${settings.drift_rule.after ?? '00:45'}` : 'Off'}`}
          </Text>
          <Text style={styles.item}>{`Crisis note: ${settings?.crisis_card ? 'Stored' : 'Not set'}`}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setIsEditing(true)}>
          <Text style={styles.primaryText}>Edit details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleExport}>
          <Text style={styles.secondaryText}>Export JSON</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.destructiveButton} onPress={handleDelete}>
          <Text style={styles.destructiveText}>Delete data</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    title: {
      fontFamily: typography.heading.fontFamily,
      fontSize: 24,
      color: colors.textPrimary,
      fontWeight: '700',
    },
    closeButton: {
      padding: spacing.sm,
    },
    closeText: {
      fontFamily: typography.button.fontFamily,
      color: colors.textSecondary,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    subtitle: {
      fontFamily: typography.title.fontFamily,
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: spacing.xs,
    },
    bodyText: {
      fontFamily: typography.body.fontFamily,
      color: colors.textPrimary,
      fontSize: 16,
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
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 4,
    },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    primaryButton: {
      borderRadius: radii.md,
      backgroundColor: colors.accent,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    primaryText: {
      color: '#fff',
      fontFamily: typography.button.fontFamily,
      fontWeight: '600',
      fontSize: 16,
    },
    secondaryButton: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    secondaryText: {
      fontFamily: typography.button.fontFamily,
      color: colors.textSecondary,
    },
    destructiveButton: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.error,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    destructiveText: {
      fontFamily: typography.button.fontFamily,
      color: colors.error,
      fontWeight: '600',
    },
  })

export default PersonalizationSettingsScreen
