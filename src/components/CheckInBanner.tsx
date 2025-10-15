import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { getColors, spacing, radii, typography } from '../theme'
import { useTheme } from '../contexts/ThemeContext'
import type { CheckInType } from '../types/mvp'

interface CheckInBannerProps {
  type: CheckInType
  prompt: string
  onRespond: () => void
  onDismiss: () => void
}

function getCheckInTypeLabel(type: CheckInType): string {
  switch (type) {
    case 'daily_morning':
      return 'Morning Check-In'
    case 'daily_evening':
      return 'Evening Reflection'
    case 'weekly':
      return 'Weekly Review'
  }
}

function getCheckInEmoji(type: CheckInType): string {
  switch (type) {
    case 'daily_morning':
      return '\u{2600}\u{FE0F}'
    case 'daily_evening':
      return '\u{1F319}'
    case 'weekly':
      return '\u{1F4CA}'
  }
}

export default function CheckInBanner({
  type,
  prompt,
  onRespond,
  onDismiss,
}: CheckInBannerProps) {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{getCheckInEmoji(type)}</Text>
        <Text style={styles.label}>{getCheckInTypeLabel(type)}</Text>
        <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
          <Text style={styles.dismissText}>\u00D7</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.prompt}>{prompt}</Text>
      <TouchableOpacity style={styles.respondButton} onPress={onRespond}>
        <Text style={styles.respondText}>Respond</Text>
      </TouchableOpacity>
    </View>
  )
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.accent + '15',
      borderRadius: radii.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.accent + '40',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    emoji: {
      fontSize: 20,
      marginRight: spacing.xs,
    },
    label: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '600',
      textTransform: 'uppercase',
      flex: 1,
    },
    dismissButton: {
      padding: spacing.xs,
    },
    dismissText: {
      fontSize: 24,
      color: colors.textTertiary,
      fontWeight: '300',
    },
    prompt: {
      ...typography.body,
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    respondButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
      alignSelf: 'flex-start',
    },
    respondText: {
      ...typography.button,
      color: '#fff',
      fontWeight: '600',
    },
  })
