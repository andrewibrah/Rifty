import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { getColors, spacing, radii, typography } from "@/theme";

export interface LessonItem {
  id: string;
  lesson_text: string;
  scope: "intent" | "routing" | "style" | "safety";
  created_at: string;
}

interface LessonRibbonProps {
  lessons: LessonItem[];
  visible: boolean;
  copy: {
    title: string;
    dismiss: string;
  };
  onDismiss: () => void;
}

const ROTATION_MS = 6500;

export function LessonRibbon({ lessons, visible, copy, onDismiss }: LessonRibbonProps) {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible || lessons.length === 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % lessons.length);
    }, ROTATION_MS);

    return () => clearInterval(interval);
  }, [visible, lessons.length]);

  useEffect(() => {
    setIndex(0);
  }, [lessons]);

  if (!visible || lessons.length === 0) {
    return null;
  }

  const lesson = lessons[index % lessons.length]!;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{copy.title}</Text>
        <Pressable onPress={onDismiss} style={styles.dismissButton}>
          <Ionicons name="close-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.dismissText}>{copy.dismiss}</Text>
        </Pressable>
      </View>
      <View style={[styles.scopeBadge, scopeStyles(lesson.scope, colors)]}>
        <Text style={styles.scopeText}>{lesson.scope}</Text>
      </View>
      <Text style={styles.lessonText}>{lesson.lesson_text}</Text>
    </View>
  );
}

const scopeStyles = (
  scope: LessonItem["scope"],
  colors: ReturnType<typeof getColors>
) => {
  switch (scope) {
    case "routing":
      return {
        backgroundColor: `${colors.accent}26`,
        borderColor: colors.accent,
      };
    case "style":
      return {
        backgroundColor: `${colors.success}20`,
        borderColor: colors.success,
      };
    case "safety":
      return {
        backgroundColor: `${colors.error}20`,
        borderColor: colors.error,
      };
    case "intent":
    default:
      return {
        backgroundColor: `${colors.warning}20`,
        borderColor: colors.warning,
      };
  }
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    dismissButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    dismissText: {
      ...typography.small,
      color: colors.textSecondary,
    },
    scopeBadge: {
      alignSelf: "flex-start",
      borderRadius: radii.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    scopeText: {
      ...typography.small,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    lessonText: {
      ...typography.body,
      color: colors.textPrimary,
    },
  });

export default LessonRibbon;
