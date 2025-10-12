import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { getColors, radii, spacing, typography } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import type { Session } from "@supabase/supabase-js";

interface SettingsScreenProps {
  onBack: () => void;
  onPersonalizationPress?: () => void;
  session: Session;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onBack,
  onPersonalizationPress,
  session,
}) => {
  const { themeMode, toggleTheme, isDark, isSystemTheme } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons
              name="arrow-back-outline"
              size={20}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.settingsCard}>
              <View style={styles.settingRow}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={colors.accent}
                  />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Email</Text>
                  <Text style={styles.settingValue}>
                    {session?.user?.email}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Preferences Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>
            <View style={styles.settingsCard}>
              {onPersonalizationPress && (
                <>
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={onPersonalizationPress}
                  >
                    <View style={styles.iconContainer}>
                      <Ionicons
                        name="color-palette-outline"
                        size={18}
                        color={colors.accent}
                      />
                    </View>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Personalization</Text>
                      <Text style={styles.settingValue}>
                        Goals & learning style
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={16}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <View style={styles.divider} />
                </>
              )}
              <TouchableOpacity style={styles.settingRow} onPress={toggleTheme}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={
                      isSystemTheme
                        ? "phone-portrait-outline"
                        : isDark
                          ? "moon-outline"
                          : "sunny-outline"
                    }
                    size={18}
                    color={colors.accent}
                  />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Theme</Text>
                  <Text style={styles.settingValue}>
                    {isSystemTheme ? "System" : isDark ? "Dark" : "Light"}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward-outline"
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Actions Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={() => supabase.auth.signOut()}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={styles.dangerButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      minHeight: 60,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.xs,
    },
    title: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      fontSize: 20,
      color: colors.textPrimary,
      flex: 1,
      textAlign: "center",
    },
    headerSpacer: {
      width: 44,
    },
    content: {
      flex: 1,
      padding: spacing.lg,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontFamily: typography.button.fontFamily,
      fontWeight: typography.button.fontWeight,
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      marginLeft: spacing.xs,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    settingsCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 56,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceElevated,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    settingInfo: {
      flex: 1,
    },
    settingLabel: {
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      fontWeight: "500" as const,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    settingValue: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: spacing.md + 32 + spacing.md,
    },
    dangerButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 48,
    },
    dangerButtonText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      fontWeight: "600" as const,
      color: colors.error,
      marginLeft: spacing.sm,
    },
  });

export default SettingsScreen;
