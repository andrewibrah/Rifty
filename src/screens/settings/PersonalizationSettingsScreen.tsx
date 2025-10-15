import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Share, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
      {/* iOS-style Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Personalization</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Persona Tag Badge */}
        <View style={styles.personaSection}>
          <View style={styles.personaBadge}>
            <Ionicons name="person-outline" size={20} color={colors.accent} style={styles.personaIcon} />
            <Text style={styles.personaTag}>{settings?.persona_tag ?? 'Generalist'}</Text>
          </View>
        </View>

        {/* Rhythm Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="time-outline" size={20} color={colors.accent} />
            <Text style={styles.cardTitle}>Rhythm</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Timezone</Text>
              <Text style={styles.value}>{bundle.profile.timezone}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Cadence</Text>
              <Text style={styles.value}>{settings?.cadence ?? 'unset'}</Text>
            </View>
          </View>
        </View>

        {/* Goals Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="trophy-outline" size={20} color={colors.accent} />
            <Text style={styles.cardTitle}>Goals</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Focus Areas</Text>
              <Text style={styles.value}>{settings?.goals?.join(', ') ?? 'None'}</Text>
            </View>
            {settings?.extra_goal && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Custom Goal</Text>
                <Text style={styles.value}>{settings.extra_goal}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Tone Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="chatbox-outline" size={20} color={colors.accent} />
            <Text style={styles.cardTitle}>Tone & Style</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Bluntness</Text>
              <Text style={styles.value}>{settings?.bluntness ?? '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Language Intensity</Text>
              <Text style={styles.value}>{settings?.language_intensity ?? '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Logging Format</Text>
              <Text style={styles.value}>{settings?.logging_format ?? '-'}</Text>
            </View>
          </View>
        </View>

        {/* Safeties Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
            <Text style={styles.cardTitle}>Safety Settings</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Anchor Rule</Text>
              <Text style={styles.value}>
                {settings?.drift_rule?.enabled ? `After ${settings.drift_rule.after ?? '00:45'}` : 'Off'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Crisis Note</Text>
              <Text style={styles.value}>{settings?.crisis_card ? 'Stored' : 'Not set'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setIsEditing(true)}>
          <Text style={styles.primaryText}>Edit Settings</Text>
        </TouchableOpacity>
        <View style={styles.secondaryActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleExport}>
            <Ionicons name="download-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.secondaryText}>Export</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.destructiveButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <Text style={styles.destructiveText}>Delete</Text>
          </TouchableOpacity>
        </View>
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
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerContent: {
      flex: 1,
      alignItems: 'center',
    },
    title: {
      fontFamily: typography.heading.fontFamily,
      fontSize: 20,
      color: colors.textPrimary,
      fontWeight: '700',
    },
    closeButton: {
      position: 'absolute',
      right: spacing.lg,
      top: spacing.md,
      padding: spacing.xs,
      borderRadius: radii.pill,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    personaSection: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    personaBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    personaIcon: {
      marginRight: spacing.sm,
    },
    personaTag: {
      fontFamily: typography.title.fontFamily,
      fontSize: 18,
      color: colors.accent,
      fontWeight: '700',
    },
    card: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    cardTitle: {
      fontFamily: typography.title.fontFamily,
      fontSize: 17,
      color: colors.textPrimary,
      fontWeight: '600',
      marginLeft: spacing.sm,
    },
    cardContent: {
      gap: spacing.sm,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: spacing.xs,
    },
    label: {
      fontFamily: typography.caption.fontFamily,
      color: colors.textSecondary,
      fontSize: 14,
      flex: 1,
    },
    value: {
      fontFamily: typography.body.fontFamily,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
      flex: 1,
      textAlign: 'right',
    },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
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
    secondaryActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    secondaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
    },
    secondaryText: {
      fontFamily: typography.button.fontFamily,
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
    destructiveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.error,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
    },
    destructiveText: {
      fontFamily: typography.button.fontFamily,
      color: colors.error,
      fontSize: 14,
      fontWeight: '600',
    },
  })

export default PersonalizationSettingsScreen
