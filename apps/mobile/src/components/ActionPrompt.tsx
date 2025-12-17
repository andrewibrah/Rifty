import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { getColors, spacing, radii, typography } from '../theme'
import { useTheme } from '../contexts/ThemeContext'

interface ActionPromptProps {
  action: string
  onAccept: () => void
  onEdit: () => void
  onDismiss: () => void
}

export default function ActionPrompt({
  action,
  onAccept,
  onEdit,
  onDismiss,
}: ActionPromptProps) {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = createStyles(colors)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Suggested Next Step</Text>
      </View>
      <Text style={styles.action}>{action}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={onDismiss}>
          <Text style={styles.buttonSecondaryText}>Ignore</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonSecondary} onPress={onEdit}>
          <Text style={styles.buttonSecondaryText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonPrimary} onPress={onAccept}>
          <Text style={styles.buttonPrimaryText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.accent + '40',
    },
    header: {
      marginBottom: spacing.sm,
    },
    label: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    action: {
      ...typography.body,
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'flex-end',
    },
    buttonPrimary: {
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
    },
    buttonPrimaryText: {
      ...typography.button,
      color: '#fff',
      fontWeight: '600',
    },
    buttonSecondary: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.textTertiary,
    },
    buttonSecondaryText: {
      ...typography.button,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  })
