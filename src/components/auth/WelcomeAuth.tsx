import React, { useMemo } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface WelcomeAuthProps {
  onEmailSignUp: () => void;
  onSimpleLogin: () => void;
  onGoogleAuth: () => void;
  onAppleAuth: () => void;
  loading: boolean;
}

export default function WelcomeAuth({
  onEmailSignUp,
  onSimpleLogin,
  onGoogleAuth,
  onAppleAuth,
  loading,
}: WelcomeAuthProps) {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Logo and Branding */}
      <View style={styles.brandingContainer}>
        <Image
          source={require("../../../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandText}>riflett</Text>
      </View>

      {/* Auth Options */}
      <View style={styles.welcomeContainer}>
        <View style={styles.authOptionsContainer}>
          <TouchableOpacity
            style={[styles.authButton, styles.emailButton]}
            onPress={onEmailSignUp}
          >
            <View style={styles.authButtonIcon}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={colors.textPrimary}
              />
            </View>
            <Text style={styles.authButtonText} numberOfLines={1}>
              Sign up with email
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.authButton, styles.googleButton]}
            onPress={onGoogleAuth}
            disabled={loading}
          >
            <View style={styles.authButtonIcon}>
              <Ionicons
                name="logo-google"
                size={20}
                color={colors.textPrimary}
              />
            </View>
            <Text style={styles.authButtonText} numberOfLines={1}>
              Continue with Google
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.authButton, styles.appleButton]}
            onPress={onAppleAuth}
            disabled={loading}
          >
            <View style={styles.authButtonIcon}>
              <Ionicons
                name="logo-apple"
                size={20}
                color={colors.textPrimary}
              />
            </View>
            <Text style={styles.authButtonText} numberOfLines={1}>
              Continue with Apple
            </Text>
          </TouchableOpacity>
        </View>

        {/* Simple Log In Button */}
        <TouchableOpacity
          style={[styles.simpleLoginButton]}
          onPress={onSimpleLogin}
        >
          <Text style={styles.simpleLoginText}>Log In</Text>
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
    brandingContainer: {
      alignItems: "center",
      marginBottom: spacing.xl * 2,
    },
    logo: {
      width: 100,
      height: 100,
      marginBottom: spacing.md,
    },
    brandText: {
      fontFamily: typography.display.fontFamily,
      fontWeight: typography.display.fontWeight,
      letterSpacing: typography.display.letterSpacing,
      fontSize: 42,
      color: colors.textPrimary,
      textAlign: "center",
    },
    welcomeContainer: {
      alignItems: "center",
      gap: spacing.xl,
    },
    authOptionsContainer: {
      width: "100%",
      gap: spacing.md,
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
    emailButton: {
      backgroundColor: colors.surface,
    },
    googleButton: {
      backgroundColor: colors.surface,
    },
    appleButton: {
      backgroundColor: colors.surface,
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
    authButtonIcon: {
      alignItems: "center",
      justifyContent: "center",
    },
    simpleLoginButton: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.md,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
      ...shadows.glass,
    },
    simpleLoginText: {
      fontFamily: typography.button.fontFamily,
      fontWeight: typography.button.fontWeight,
      letterSpacing: typography.button.letterSpacing,
      fontSize: 16,
      color: colors.background,
    },
  });
