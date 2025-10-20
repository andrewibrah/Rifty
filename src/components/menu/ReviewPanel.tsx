import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { getColors, spacing, radii, typography, shadows } from "../../theme";
import { listJournals } from "../../services/data";
import { listGoals } from "../../services/goals";
import { searchAtomicMoments } from "../../services/atomicMoments";
import {
  generateWeeklyReview,
  type WeeklyReviewReport,
} from "../../services/review";

interface ReviewPanelProps {
  onClose: () => void;
  onOpenGoals?: () => void;
  onOpenJournals?: () => void;
  onOpenSchedules?: () => void;
  onOpenMoments?: () => void;
}

export interface ReviewPanelRef {
  refresh: () => void;
}

interface ReviewCounts {
  journals: number;
  goals: number;
  schedules: number;
  moments: number;
}

const ReviewPanel = forwardRef<ReviewPanelRef, ReviewPanelProps>(
  (
    { onClose, onOpenGoals, onOpenJournals, onOpenSchedules, onOpenMoments },
    ref
  ) => {
    const { themeMode } = useTheme();
    const colors = getColors(themeMode);
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [counts, setCounts] = useState<ReviewCounts>({
      journals: 0,
      goals: 0,
      schedules: 0,
      moments: 0,
    });
    const [review, setReview] = useState<WeeklyReviewReport | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [loadingReview, setLoadingReview] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
      setLoadingStats(true);
      setError(null);
      try {
        const [entries, goals, moments] = await Promise.all([
          listJournals({ limit: 500 }),
          listGoals({ limit: 200 }),
          searchAtomicMoments({ limit: 200 }),
        ]);

        const journalCount = entries.filter(
          (entry) => entry.type === "journal"
        ).length;
        const scheduleCount = entries.filter(
          (entry) => entry.type === "schedule"
        ).length;

        setCounts({
          journals: journalCount,
          goals: goals.length,
          schedules: scheduleCount,
          moments: moments.length,
        });
      } catch (err) {
        console.error("[ReviewPanel] load stats failed", err);
        setError("Unable to load review stats.");
      } finally {
        setLoadingStats(false);
      }
    }, []);

    const loadReview = useCallback(async () => {
      setLoadingReview(true);
      setError(null);
      try {
        const result = await generateWeeklyReview();
        setReview(result);
      } catch (err) {
        console.error("[ReviewPanel] weekly review failed", err);
        setError("Unable to generate weekly review right now.");
      } finally {
        setLoadingReview(false);
      }
    }, []);

    useEffect(() => {
      loadStats();
      loadReview();
    }, [loadStats, loadReview]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: loadReview,
      }),
      [loadReview]
    );

    const renderCard = (
      label: string,
      value: number,
      icon: keyof typeof Ionicons.glyphMap,
      onPress?: () => void
    ) => (
      <TouchableOpacity
        key={label}
        style={styles.metricCard}
        onPress={onPress}
        disabled={!onPress}
      >
        <View style={styles.metricHeader}>
          <Ionicons name={icon} size={18} color={colors.accent} />
          <Text style={styles.metricValue}>{value}</Text>
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </TouchableOpacity>
    );

    const renderBullets = (title: string, items: string[]) => (
      <View style={styles.reviewSection} key={title}>
        <Text style={styles.reviewHeading}>{title}</Text>
        {items.length === 0 ? (
          <Text style={styles.reviewEmpty}>No insights captured yet.</Text>
        ) : (
          items.map((item, idx) => (
            <View key={`${title}-${idx}`} style={styles.bulletRow}>
              <Ionicons name="ellipse" size={6} color={colors.accent} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))
        )}
      </View>
    );

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.metricsRow}>
            {renderCard(
              "Journals",
              counts.journals,
              "book-outline",
              onOpenJournals
            )}
            {renderCard("Goals", counts.goals, "flag-outline", onOpenGoals)}
            {renderCard(
              "Schedules",
              counts.schedules,
              "calendar-outline",
              onOpenSchedules
            )}
            {renderCard(
              "Atomic Moments",
              counts.moments,
              "sparkles-outline",
              onOpenMoments
            )}
          </View>

          {(loadingStats || loadingReview) && (
            <ActivityIndicator style={styles.loader} color={colors.accent} />
          )}

          {review && !loadingReview && (
            <View style={styles.reviewCard}>
              {renderBullets("Highlights", review.highlights)}
              {renderBullets("Goal Progress", review.goalProgress)}
              {renderBullets("Patterns", review.patterns)}
              {renderBullets("Suggestions", review.suggestions)}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }
);

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerSpacer: {
      width: 44,
    },
    errorText: {
      color: colors.error,
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      marginBottom: spacing.sm,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.xl,
    },
    metricsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    metricCard: {
      width: "48%",
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadows.glass,
    },
    metricHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    metricValue: {
      fontFamily: typography.heading.fontFamily,
      fontSize: 18,
      color: colors.textPrimary,
    },
    metricLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    loader: {
      marginVertical: spacing.md,
    },
    reviewCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.lg,
    },
    reviewSection: {
      gap: spacing.xs,
    },
    reviewHeading: {
      fontFamily: typography.title.fontFamily,
      fontSize: 16,
      color: colors.textPrimary,
    },
    reviewEmpty: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    bulletText: {
      flex: 1,
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
  });

export default ReviewPanel;
