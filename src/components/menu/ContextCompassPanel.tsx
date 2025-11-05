import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ContextPanelModel } from "@/utils/contextCompass";
import { useTheme } from "@/contexts/ThemeContext";
import { getColors, spacing, radii, typography } from "@/theme";

interface ContextCompassPanelProps {
  model: ContextPanelModel;
  loading: boolean;
  open: boolean;
  copy: {
    title: string;
    modes: string;
    topics: string;
    evidence: string;
    collapsedHint: string;
    fatigueHighlight: string;
    empty: string;
  };
  onToggle: () => void;
}

export function ContextCompassPanel({
  model,
  loading,
  open,
  copy,
  onToggle,
}: ContextCompassPanelProps) {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={onToggle}>
        <View style={styles.titleRow}>
          <Ionicons
            name="compass-outline"
            size={18}
            color={colors.accent}
          />
          <Text style={styles.title}>{copy.title}</Text>
        </View>
        <Ionicons
          name={open ? "chevron-up-outline" : "chevron-down-outline"}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {!open && !loading && (
        <Text style={styles.collapsedHint}>{copy.collapsedHint}</Text>
      )}

      {open && (
        <View style={styles.body}>
          {loading && (
            <ActivityIndicator size="small" color={colors.accent} />
          )}

          {!loading && model.empty && (
            <Text style={styles.emptyText}>{copy.empty}</Text>
          )}

          {!loading && !model.empty && (
            <>
              {model.fatigueHighlight && (
                <View style={styles.highlightBanner}>
                  <Ionicons
                    name="flash-outline"
                    size={16}
                    color={colors.warning}
                  />
                  <Text style={styles.highlightText}>
                    {copy.fatigueHighlight}
                  </Text>
                </View>
              )}

              {model.modes.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{copy.modes}</Text>
                  {model.modes.map((mode, index) => (
                    <View
                      key={`${mode.label}-${index}`}
                      style={styles.modeRow}
                    >
                      <Text style={styles.modeLabel}>{mode.label}</Text>
                      <Text style={styles.modeBadge}>{mode.count}</Text>
                      <Text style={styles.modeTimestamp}>
                        {new Date(mode.last_seen_at).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {model.topics.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{copy.topics}</Text>
                  <View style={styles.topicRow}>
                    {model.topics.map((topic, index) => (
                      <View
                        key={`${topic.topic}-${index}`}
                        style={styles.topicChip}
                      >
                        <Text style={styles.topicText}>{topic.topic}</Text>
                        <Text style={styles.topicWeight}>
                          {(topic.weight * 100).toFixed(0)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {model.evidence.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{copy.evidence}</Text>
                  <View style={styles.evidenceGrid}>
                    {model.evidence.map((node, index) => (
                      <View
                        key={`${node.id}-${index}`}
                        style={[
                          styles.evidenceCard,
                          node.sources.includes("fatigue_recall") &&
                            styles.evidenceCardHighlight,
                        ]}
                      >
                        <Text style={styles.evidenceType}>{node.type}</Text>
                        <Text style={styles.evidenceText}>{node.text}</Text>
                        <View style={styles.evidenceMetaRow}>
                          <Text style={styles.evidenceMeta}>
                            Trust {(node.trust_weight * 100).toFixed(0)}%
                          </Text>
                          <Text style={styles.evidenceMeta}>
                            Strength {(node.strength * 100).toFixed(0)}%
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    title: {
      ...typography.caption,
      textTransform: "uppercase",
      color: colors.textSecondary,
      letterSpacing: 0.6,
    },
    collapsedHint: {
      ...typography.small,
      color: colors.textTertiary,
      marginTop: spacing.xs,
    },
    body: {
      marginTop: spacing.md,
      gap: spacing.md,
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    section: {
      gap: spacing.sm,
    },
    sectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    modeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    modeLabel: {
      ...typography.body,
      flex: 1,
      color: colors.textPrimary,
      textTransform: "capitalize",
    },
    modeBadge: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: "600",
    },
    modeTimestamp: {
      ...typography.small,
      color: colors.textTertiary,
    },
    topicRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    topicChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.lg,
      backgroundColor: colors.surfaceElevated,
    },
    topicText: {
      ...typography.small,
      color: colors.textPrimary,
    },
    topicWeight: {
      ...typography.small,
      color: colors.textSecondary,
      fontWeight: "600",
    },
    evidenceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    evidenceCard: {
      flexBasis: "48%",
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      gap: spacing.xs,
    },
    evidenceCardHighlight: {
      borderColor: colors.warning,
      backgroundColor: `${colors.warning}22`,
    },
    evidenceType: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    evidenceText: {
      ...typography.body,
      color: colors.textPrimary,
    },
    evidenceMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    evidenceMeta: {
      ...typography.small,
      color: colors.textSecondary,
    },
    highlightBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: `${colors.warning}15`,
      borderWidth: 1,
      borderColor: `${colors.warning}55`,
    },
    highlightText: {
      ...typography.small,
      color: colors.warning,
      flex: 1,
    },
  });

export default ContextCompassPanel;
