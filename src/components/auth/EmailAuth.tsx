import React, { useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface EmailAuthProps {
  isSignUp: boolean;
  email: string;
  password: string;
  loading: boolean;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function EmailAuth({
  isSignUp,
  email,
  password,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onBack,
}: EmailAuthProps) {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.emailAuthContainer}>
        <Text style={styles.emailAuthTitle}>
          {isSignUp ? "Sign Up" : "Log In"}
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.textInput}
            value={email}
            onChangeText={onEmailChange}
            placeholder="email@address.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.textInput}
            value={password}
            onChangeText={onPasswordChange}
            placeholder="••••••••••••••••••••••••"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
        </View>

        <TouchableOpacity
          style={[styles.authButton, styles.submitButton]}
          onPress={onSubmit}
          disabled={loading}
        >
          <Text style={styles.authButtonText}>
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Log In"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.authButton, styles.backButton]}
          onPress={onBack}
        >
          <Text style={styles.authButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.background,
    },
    emailAuthContainer: {
      alignItems: "center",
      gap: spacing.lg,
      width: "100%",
    },
    emailAuthTitle: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      fontSize: 24,
      color: colors.textPrimary,
    },
    inputContainer: {
      width: "100%",
      gap: spacing.sm,
    },
    inputLabel: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      fontSize: 14,
      color: colors.textSecondary,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    textInput: {
      width: "100%",
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: typography.body.fontFamily,
      fontSize: 16,
      color: colors.textPrimary,
      letterSpacing: typography.body.letterSpacing,
    },
    authButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      minHeight: 48,
      gap: spacing.sm,
      minWidth: 280,
    },
    submitButton: {
      backgroundColor: colors.accent,
      ...shadows.glass,
    },
    backButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    authButtonText: {
      fontFamily: typography.button.fontFamily,
      fontWeight: typography.button.fontWeight,
      letterSpacing: typography.button.letterSpacing,
      fontSize: 16,
      color: colors.textPrimary,
      flex: 1,
      textAlign: "center",
    },
  });
