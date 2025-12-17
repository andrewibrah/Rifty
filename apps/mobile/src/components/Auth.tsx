import React, { useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import WelcomeAuth from "./auth/WelcomeAuth";
import EmailAuth from "./auth/EmailAuth";

type AuthMode = "welcome" | "email" | "google" | "apple";

export default function Auth() {
  const [authMode, setAuthMode] = useState<AuthMode>("welcome");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const handleEmailSignUp = () => {
    setIsSignUp(true);
    setAuthMode("email");
  };

  const handleSimpleLogin = () => {
    setIsSignUp(false);
    setAuthMode("email");
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });
      if (error) Alert.alert("Error", error.message);
    } catch (error) {
      Alert.alert("Error", "Unable to sign in with Google");
    } finally {
      setLoading(false);
    }
  };

  const handleAppleAuth = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
      });
      if (error) Alert.alert("Error", error.message);
    } catch (error) {
      Alert.alert("Error", "Unable to sign in with Apple");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToWelcome = () => {
    setAuthMode("welcome");
    setLoading(false);
    setEmail("");
    setPassword("");
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: email,
          password: password,
        });
        if (error) {
          Alert.alert("Sign Up Error", error.message);
        } else {
          Alert.alert("Success", "Please check your email for verification!");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });
        if (error) {
          Alert.alert("Sign In Error", error.message);
        }
      }
    } catch (error) {
      Alert.alert("Error", "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (authMode === "welcome") {
    return (
      <WelcomeAuth
        onEmailSignUp={handleEmailSignUp}
        onSimpleLogin={handleSimpleLogin}
        onGoogleAuth={handleGoogleAuth}
        onAppleAuth={handleAppleAuth}
        loading={loading}
      />
    );
  }

  return (
    <EmailAuth
      isSignUp={isSignUp}
      email={email}
      password={password}
      loading={loading}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleEmailAuth}
      onBack={handleBackToWelcome}
    />
  );
}
