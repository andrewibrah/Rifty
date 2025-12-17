import React, { useMemo } from 'react'
import { Modal, View, StyleSheet, Platform } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import PersonalizationSettingsScreen from '../screens/settings/PersonalizationSettingsScreen'
import type { PersonalizationBundle, PersonalizationState, PersonaTag } from '../types/personalization'
import { useTheme } from '../contexts/ThemeContext'
import { getColors } from '../theme'

interface PersonalizationModalProps {
  visible: boolean
  bundle: PersonalizationBundle | null
  onClose: () => void
  onSave: (state: PersonalizationState, timezone: string) => Promise<PersonaTag>
}

const PersonalizationModal: React.FC<PersonalizationModalProps> = ({
  visible,
  bundle,
  onClose,
  onSave,
}) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const insets = useSafeAreaInsets()

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: {
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'ios' ? insets.top : 0,
        },
        container: {
          flex: 1,
        },
      }),
    [colors.background, insets.top]
  )

  if (!bundle) return null

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <PersonalizationSettingsScreen bundle={bundle} onClose={onClose} onSave={onSave} />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

export default PersonalizationModal
