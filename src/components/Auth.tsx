import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
} from "react-native";
import { supabase } from "../lib/supabase";
import { colors, radii, spacing, typography, shadows } from "../theme";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) Alert.alert(error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const {
      data: { session },
      error,
    } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) Alert.alert(error.message);
    if (!session)
      Alert.alert("Please check your inbox for email verification!");
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      {/* Logo and Branding */}
      <View style={styles.brandingContainer}>
        <Image
          source={require("../../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandText}>riflett</Text>
      </View>

      {/* Input Fields */}
      <View style={styles.formContainer}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, emailFocused && styles.inputFocused]}
              value={email}
              onChangeText={setEmail}
              placeholder="email@address.com"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              editable={!loading}
              numberOfLines={1}
              multiline={false}
              maxLength={40}
              scrollEnabled={false}
            />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, passwordFocused && styles.inputFocused]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••••••••••••••••••"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              editable={!loading}
              numberOfLines={1}
              multiline={false}
              maxLength={40}
              scrollEnabled={false}
            />
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonPrimary,
              loading && styles.buttonDisabled,
            ]}
            onPress={signInWithEmail}
            disabled={loading}
          >
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
              {loading ? "Loading..." : "Sign In"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonSecondary,
              loading && styles.buttonDisabled,
            ]}
            onPress={signUpWithEmail}
            disabled={loading}
          >
            <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
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
  formContainer: {
    width: "100%",
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  label: {
    fontFamily: typography.button.fontFamily,
    fontWeight: typography.button.fontWeight,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  inputWrapper: {
    height: 56,
    width: "100%",
    minWidth: 300,
    overflow: "hidden",
  },
  input: {
    width: "100%",
    height: 56,
    minWidth: 300,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md + spacing.xs,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: typography.body.fontFamily,
    fontWeight: typography.body.fontWeight,
    fontSize: 16,
    lineHeight: 20,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: "center",
    includeFontPadding: false,
    overflow: "hidden",
    ...shadows.glass,
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
  },
  buttonsContainer: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  button: {
    width: "100%",
    height: 56,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...shadows.glow,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    ...shadows.glass,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    letterSpacing: typography.button.letterSpacing,
    fontWeight: "700" as const,
  },
  buttonTextPrimary: {
    color: colors.textPrimary,
  },
  buttonTextSecondary: {
    color: colors.textSecondary,
  },
});
