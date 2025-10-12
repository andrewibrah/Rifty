import React, { useMemo } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { getColors, radii, spacing, typography } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import type { Session } from "@supabase/supabase-js";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  session: Session;
  onPersonalizationPress?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  session,
  onPersonalizationPress,
}) => {
  const { themeMode, toggleTheme, isDark, isSystemTheme } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <View style={styles.overlay}>
          <SafeAreaView
            style={styles.modalCard}
            edges={["top", "bottom", "left", "right"]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.headerButtonPlaceholder} />
              <Text style={styles.modalTitle}>Settings</Text>
              <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                <Ionicons
                  name="arrow-back-outline"
                  size={20}
                  color={colors.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              {/* Account Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.accountCard}>
                  <View style={styles.accountIconContainer}>
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountLabel}>Email</Text>
                    <Text style={styles.accountEmail}>
                      {session?.user?.email}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Personalization Button */}
              {onPersonalizationPress && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Profile</Text>
                  <TouchableOpacity
                    style={[
                      styles.personalizationButton,
                      { borderLeftColor: colors.accent, borderLeftWidth: 2 },
                    ]}
                    onPress={() => {
                      onPersonalizationPress();
                    }}
                  >
                    <View style={styles.personalizationIconContainer}>
                      <Ionicons
                        name="color-palette-outline"
                        size={20}
                        color={colors.accent}
                      />
                    </View>
                    <View style={styles.personalizationInfo}>
                      <Text style={styles.personalizationLabel}>
                        Personalization
                      </Text>
                      <Text style={styles.personalizationValue}>
                        Goals, learning style, and preferences
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={16}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Color Scheme Button */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Appearance</Text>
                <TouchableOpacity
                  style={[
                    styles.colorSchemeButton,
                    { borderLeftColor: colors.accent, borderLeftWidth: 2 },
                  ]}
                  onPress={toggleTheme}
                >
                  <View style={styles.colorSchemeIconContainer}>
                    <Ionicons
                      name={
                        isSystemTheme
                          ? "phone-portrait-outline"
                          : isDark
                            ? "moon-outline"
                            : "sunny-outline"
                      }
                      size={20}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.colorSchemeInfo}>
                    <Text style={styles.colorSchemeLabel}>Theme</Text>
                    <Text style={styles.colorSchemeValue}>
                      {isSystemTheme
                        ? "System Theme"
                        : isDark
                          ? "Dark Mode"
                          : "Light Mode"}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward-outline"
                    size={16}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {/* Logout Button */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Actions</Text>
                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={() => supabase.auth.signOut()}
                >
                  <View style={styles.logoutIconContainer}>
                    <Ionicons
                      name="log-out-outline"
                      size={18}
                      color={colors.error}
                    />
                  </View>
                  <Text style={styles.logoutButtonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalCard: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
      minHeight: 60,
    },
    modalTitle: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      fontSize: 20,
      color: colors.textPrimary,
      flex: 1,
      textAlign: "center",
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.xs,
    },
    headerButtonPlaceholder: {
      width: 36,
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontFamily: typography.button.fontFamily,
      fontWeight: typography.button.fontWeight,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    accountCard: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md + spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderLeftWidth: 2,
      borderLeftColor: "transparent",
    },
    accountIconContainer: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceElevated,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    accountInfo: {
      flex: 1,
    },
    accountLabel: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    accountEmail: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 15,
      color: colors.textPrimary,
    },
    personalizationButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md + spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderLeftWidth: 2,
      borderLeftColor: "transparent",
    },
    personalizationIconContainer: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceElevated,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    personalizationInfo: {
      flex: 1,
    },
    personalizationLabel: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    personalizationValue: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 15,
      color: colors.textPrimary,
    },
    colorSchemeButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md + spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderLeftWidth: 2,
      borderLeftColor: "transparent",
    },
    colorSchemeIconContainer: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceElevated,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    colorSchemeInfo: {
      flex: 1,
    },
    colorSchemeLabel: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    colorSchemeValue: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 15,
      color: colors.textPrimary,
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md + spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderLeftWidth: 2,
      borderLeftColor: colors.error,
    },
    logoutIconContainer: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceElevated,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    logoutButtonText: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 15,
      color: colors.textPrimary,
    },
  });

export default SettingsModal;
