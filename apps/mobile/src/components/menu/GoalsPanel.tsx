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
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { getColors, spacing, radii, typography, shadows } from "../../theme";
import {
  listGoals,
  updateGoal,
  deleteGoal,
  createGoal,
} from "../../services/goals";
import type { Goal, MicroStep, GoalStatus } from "../../types/mvp";
import { generateUUID } from "../../utils/id";
import { fetchGoalInsights, fetchGoalInsight, type GoalInsight } from "../../services/goalInsights";
import { planRhythmReset, checkMissedAnchors } from "../../services/calendarAnchors";
import { isGoalsV2Enabled } from "../../utils/flags";

interface GoalsPanelProps {
  onClose: () => void;
}

export interface GoalsPanelRef {
  addGoal: () => void;
}

const MAX_ACTIVE_GOALS = 3;

const statusOptions: GoalStatus[] = [
  "active",
  "completed",
  "paused",
  "archived",
];

const getBadgeStateStyle = (
  styles: ReturnType<typeof createStyles>,
  state: string
) => {
  switch (state) {
    case "alive":
      return styles.goalBadgeState_alive;
    case "dormant":
      return styles.goalBadgeState_dormant;
    case "misaligned":
      return styles.goalBadgeState_misaligned;
    case "complete":
      return styles.goalBadgeState_complete;
    default:
      return undefined;
  }
};

const GoalsPanel = forwardRef<GoalsPanelRef, GoalsPanelProps>(
  ({ onClose }, ref) => {
    const { themeMode } = useTheme();
    const colors = getColors(themeMode);
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
    const [newStep, setNewStep] = useState("");
    const [creatingQuickGoal, setCreatingQuickGoal] = useState(false);
    const [insights, setInsights] = useState<Record<string, GoalInsight>>({});
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    const refresh = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await listGoals({ limit: 100 });
        setGoals(results);
        if (!selectedGoalId && results.length > 0) {
          const active = results.find((goal) => goal.status === "active");
          setSelectedGoalId(active?.id ?? results[0]?.id ?? null);
        }
        if (isGoalsV2Enabled() && results.length > 0) {
          fetchGoalInsights(results.map((goal) => goal.id))
            .then((data) => setInsights(data))
            .catch((err) => console.warn("[GoalsPanel] insights fetch failed", err));
          checkMissedAnchors()
            .then((anchors) => {
              const firstAnchor = anchors[0];
              if (!firstAnchor) {
                setInfoMessage(null);
                return;
              }
              const goalTitle =
                results.find((goal) => goal.id === firstAnchor.goal_id)?.title ??
                "a goal";
              const label =
                firstAnchor.anchor_type === "milestone"
                  ? "Milestone anchor"
                  : "Check-in anchor";
              setInfoMessage(`${label} overdue for ${goalTitle}. Take a moment to reconnect.`);
            })
            .catch((err) => console.warn("[GoalsPanel] anchor check failed", err));
        } else {
          setInsights({});
          setInfoMessage(null);
        }
      } catch (err) {
        console.error("[GoalsPanel] fetch failed", err);
        setError("Unable to load goals.");
      } finally {
        setLoading(false);
      }
    }, [selectedGoalId]);

    useEffect(() => {
      refresh();
    }, [refresh]);

    const selectedGoal =
      goals.find((goal) => goal.id === selectedGoalId) ?? null;
    const selectedGoalInsight =
      selectedGoal && isGoalsV2Enabled() ? insights[selectedGoal.id] : undefined;
    const selectedProgress = selectedGoalInsight
      ? Math.round((selectedGoalInsight.progress_pct ?? 0) * 100)
      : 0;
    const selectedCoherence = selectedGoalInsight
      ? Math.round((selectedGoalInsight.coherence_score ?? 0) * 100)
      : 0;
    const selectedGhiKey = selectedGoalInsight
      ? (selectedGoalInsight.ghi_state ?? "unknown").toLowerCase()
      : "unknown";
    const selectedGhiLabel =
      selectedGoalInsight?.ghi_state && selectedGoalInsight.ghi_state.length > 0
        ? selectedGoalInsight.ghi_state.toUpperCase()
        : "";

    const handleSelectGoal = useCallback((goalId: string) => {
      setSelectedGoalId(goalId);
    }, []);

    const updateGoalList = useCallback((updated: Goal) => {
      setGoals((prev) =>
        prev.map((goal) => (goal.id === updated.id ? updated : goal))
      );
    }, []);

    const refreshInsightForGoal = useCallback((goalId: string) => {
      if (!isGoalsV2Enabled()) {
        return;
      }
      fetchGoalInsight(goalId)
        .then((insight) => {
          setInsights((prev) => ({ ...prev, [goalId]: insight }));
        })
        .catch((err) => {
          console.warn("[GoalsPanel] insight refresh failed", err);
        });
    }, []);

    const handleRhythmReset = useCallback(
      async (goal: Goal) => {
        if (!isGoalsV2Enabled()) {
          return;
        }
        try {
          await planRhythmReset(goal);
          setInfoMessage(
            `Rhythm reset scheduled for ${goal.title}. Expect two check-ins and a milestone nudged over the next three days.`
          );
        } catch (err) {
          console.error("[GoalsPanel] rhythm reset failed", err);
          setError("Unable to schedule rhythm reset.");
        }
      },
      []
    );

    const handleToggleStep = useCallback(
      async (goal: Goal, step: MicroStep) => {
        const steps = goal.micro_steps.map((item) =>
          item.id === step.id
            ? {
                ...item,
                completed: !item.completed,
                completed_at: !item.completed ? new Date().toISOString() : null,
              }
            : item
        );
        try {
          const updated = await updateGoal(goal.id, { micro_steps: steps });
          updateGoalList(updated);
          refreshInsightForGoal(updated.id);
        } catch (err) {
          console.error("[GoalsPanel] toggle step failed", err);
          setError("Unable to update milestone.");
        }
      },
      [refreshInsightForGoal, updateGoalList]
    );

    const handleAddStep = useCallback(async () => {
      if (!selectedGoal || !newStep.trim()) return;
      const step: MicroStep = {
        id: generateUUID(),
        description: newStep.trim(),
        completed: false,
      };
      try {
        const updated = await updateGoal(selectedGoal.id, {
          micro_steps: [...selectedGoal.micro_steps, step],
        });
        updateGoalList(updated);
        setNewStep("");
        refreshInsightForGoal(updated.id);
      } catch (err) {
        console.error("[GoalsPanel] add step failed", err);
        setError("Unable to add milestone.");
      }
    }, [newStep, refreshInsightForGoal, selectedGoal, updateGoalList]);

    const handleStatusChange = useCallback(
      async (goal: Goal, status: GoalStatus) => {
        try {
          const updated = await updateGoal(goal.id, { status });
          updateGoalList(updated);
          refreshInsightForGoal(updated.id);
        } catch (err) {
          console.error("[GoalsPanel] status change failed", err);
          setError("Unable to update goal status.");
        }
      },
      [refreshInsightForGoal, updateGoalList]
    );

    const handleDeleteGoal = useCallback(
      async (goalId: string) => {
        try {
          await deleteGoal(goalId);
          setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
          setInsights((prev) => {
            if (!prev[goalId]) return prev;
            const next = { ...prev };
            delete next[goalId];
            return next;
          });
          if (selectedGoalId === goalId) {
            setSelectedGoalId(null);
          }
        } catch (err) {
          console.error("[GoalsPanel] delete failed", err);
          setError("Unable to delete goal.");
        }
      },
      [selectedGoalId]
    );

    const handleQuickCreate = useCallback(async () => {
      setCreatingQuickGoal(true);
      try {
        const activeGoals = goals.filter(
          (goal) => goal.status === "active"
        ).length;
        if (activeGoals >= MAX_ACTIVE_GOALS) {
          setError(
            "You already have three active goals. Archive one to create a new goal."
          );
          setCreatingQuickGoal(false);
          return;
        }

        const created = await createGoal({
          title: "New Goal",
          description: "Clarify this goal and add milestones.",
          micro_steps: [],
        });
        setGoals((prev) => [created, ...prev]);
        setSelectedGoalId(created.id);
        refreshInsightForGoal(created.id);
      } catch (err) {
        console.error("[GoalsPanel] quick create failed", err);
        setError("Unable to create goal.");
      } finally {
        setCreatingQuickGoal(false);
      }
    }, [goals, refreshInsightForGoal]);

    useImperativeHandle(
      ref,
      () => ({
        addGoal: handleQuickCreate,
      }),
      [handleQuickCreate]
    );

    const renderGoalCard = ({ item }: { item: Goal }) => {
      const insight = isGoalsV2Enabled() ? insights[item.id] : undefined;
      const completed = item.micro_steps.filter((step) => step.completed).length;
      const total = item.micro_steps.length || 1;
      const fallbackProgress = Math.round((completed / total) * 100);
      const progress = insight
        ? Math.round((insight.progress_pct ?? 0) * 100)
        : fallbackProgress;
      const coherence = insight
        ? Math.round((insight.coherence_score ?? 0) * 100)
        : null;
      const rawState = insight?.ghi_state ?? item.status;
      const ghiState = (rawState ?? '').toLowerCase();
      const ghiStateLabel = (rawState ?? '').toUpperCase();
      const isActive = item.status === "active";

      return (
        <TouchableOpacity
          onPress={() => handleSelectGoal(item.id)}
          style={[
            styles.goalCard,
            item.id === selectedGoalId && styles.goalCardSelected,
          ]}
        >
          <View style={styles.goalHeader}>
            <Text style={styles.goalTitle}>{item.title}</Text>
            <Text
              style={[styles.goalStatus, !isActive && styles.goalStatusMuted]}
            >
              {item.status.toUpperCase()}
            </Text>
          </View>
          {item.description ? (
            <Text style={styles.goalDescription}>{item.description}</Text>
          ) : null}
          {isGoalsV2Enabled() && insight ? (
            <View style={styles.goalFooterExpanded}>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${Math.max(progress, 4)}%` }]}
                />
              </View>
              <View style={styles.goalMetricsRow}>
                <Text style={styles.goalMetricText}>{`${progress}% progress`}</Text>
                <Text style={styles.goalMetricText}>{`Coherence ${coherence ?? 0}%`}</Text>
                <Text
                  style={[
                    styles.goalBadgeState,
                    getBadgeStateStyle(styles, ghiState) ?? styles.goalBadgeState,
                  ]}
                >
                  {ghiStateLabel}
                </Text>
              </View>
              <Text style={styles.goalSteps}>{`${completed}/${item.micro_steps.length || 0} milestones`}</Text>
            </View>
          ) : (
            <View style={styles.goalFooter}>
              <Text style={styles.goalProgress}>{`${progress}%`}</Text>
              <Text
                style={styles.goalSteps}
              >{`${completed}/${item.micro_steps.length || 0} milestones`}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    };

    const renderStep = (goal: Goal, step: MicroStep) => (
      <TouchableOpacity
        key={step.id}
        style={[styles.stepRow, step.completed && styles.stepRowCompleted]}
        onPress={() => handleToggleStep(goal, step)}
      >
        <Ionicons
          name={step.completed ? "checkmark-circle" : "ellipse-outline"}
          size={18}
          color={step.completed ? colors.accent : colors.textSecondary}
        />
        <Text
          style={[styles.stepText, step.completed && styles.stepTextCompleted]}
        >
          {step.description}
        </Text>
      </TouchableOpacity>
    );

    return (
      <View style={styles.container}>
        {creatingQuickGoal && (
          <Text style={styles.hintText}>Creating quick goal…</Text>
        )}
        {infoMessage && <Text style={styles.infoText}>{infoMessage}</Text>}
        {error && <Text style={styles.errorText}>{error}</Text>}
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            style={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.goalsSection}>
              <Text style={styles.sectionLabel}>
                {goals.length === 0 ? "No Goals" : "Your Goals"}
              </Text>
              {goals.length === 0 ? (
                <Text style={styles.emptyGoalsText}>
                  Create your first goal to get started
                </Text>
              ) : (
                <FlatList
                  data={goals}
                  keyExtractor={(item) => item.id}
                  renderItem={renderGoalCard}
                  ItemSeparatorComponent={() => (
                    <View style={{ height: spacing.sm }} />
                  )}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={false}
                />
              )}
            </View>

            {selectedGoal && (
              <View style={styles.detailCard}>
                <Text style={styles.detailTitle}>{selectedGoal.title}</Text>
                <Text style={styles.detailCategory}>
                  {selectedGoal.category || "General focus"}
                </Text>

                <View style={styles.statusRow}>
                  {statusOptions.map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusChip,
                        selectedGoal.status === status &&
                          styles.statusChipActive,
                      ]}
                      onPress={() => handleStatusChange(selectedGoal, status)}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          selectedGoal.status === status &&
                            styles.statusChipTextActive,
                        ]}
                      >
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {isGoalsV2Enabled() ? (
                  <TouchableOpacity
                    style={styles.anchorButton}
                    onPress={() => handleRhythmReset(selectedGoal)}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={colors.accent}
                    />
                    <Text style={styles.anchorButtonText}>Rhythm Reset</Text>
                  </TouchableOpacity>
                ) : null}

                {isGoalsV2Enabled() && selectedGoalInsight ? (
                  <View style={styles.healthDetailSection}>
                    <View style={styles.goalMetricsRow}>
                      <Text style={styles.goalMetricText}>{`${selectedProgress}% progress`}</Text>
                      <Text style={styles.goalMetricText}>{`Coherence ${selectedCoherence}%`}</Text>
                      <Text
                        style={[
                          styles.goalBadgeState,
                          getBadgeStateStyle(styles, selectedGhiKey) ?? styles.goalBadgeState,
                        ]}
                      >
                        {selectedGhiLabel}
                      </Text>
                    </View>

                    {selectedGoalInsight.badges.length > 0 ? (
                      <View style={styles.badgesRow}>
                        {selectedGoalInsight.badges.map((badge) => (
                          <View key={badge} style={styles.badgeChip}>
                            <Text style={styles.badgeChipText}>{badge}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <Text style={styles.sectionHeading}>Latest reflections</Text>
                    {selectedGoalInsight.reflections.length === 0 ? (
                      <Text style={styles.emptySteps}>
                        No reflections linked yet. Capture a note to build momentum.
                      </Text>
                    ) : (
                      selectedGoalInsight.reflections.slice(0, 2).map((reflection) => {
                        const alignment = Math.round(
                          Math.min(1, Math.max(0, reflection.alignment_score ?? 0)) * 100
                        );
                        const created = new Date(reflection.created_at).toLocaleDateString();
                        return (
                          <View key={reflection.id} style={styles.reflectionCard}>
                            <Text style={styles.reflectionNote}>
                              {reflection.note?.trim() || 'Reflection captured'}
                            </Text>
                            <Text style={styles.reflectionMeta}>
                              {`Alignment ${alignment}% • ${created}`}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                ) : null}

                <Text style={styles.sectionHeading}>Milestones</Text>
                <View style={styles.stepsContainer}>
                  {selectedGoal.micro_steps.length === 0 ? (
                    <Text style={styles.emptySteps}>
                      No milestones yet. Add your first one below.
                    </Text>
                  ) : (
                    selectedGoal.micro_steps.map((step) =>
                      renderStep(selectedGoal, step)
                    )
                  )}
                </View>

                <View style={styles.addStepRow}>
                  <TextInput
                    style={styles.stepInput}
                    value={newStep}
                    onChangeText={setNewStep}
                    placeholder="Add a micro-step"
                    placeholderTextColor={colors.textTertiary}
                    returnKeyType="done"
                    onSubmitEditing={handleAddStep}
                  />
                  <TouchableOpacity
                    style={styles.addStepButton}
                    onPress={handleAddStep}
                    disabled={!newStep.trim()}
                  >
                    <Ionicons
                      name="add-outline"
                      size={20}
                      color={colors.textPrimary}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailFooter}>
                  <TouchableOpacity
                    style={styles.deleteGoalButton}
                    onPress={() => handleDeleteGoal(selectedGoal.id)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.error}
                    />
                    <Text style={styles.deleteGoalText}>Delete goal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        )}
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
    hintText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    infoText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.accent,
      marginBottom: spacing.sm,
    },
    errorText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.error,
      marginBottom: spacing.sm,
    },
    loader: {
      marginTop: spacing.xl,
    },
    scrollContainer: {
      flex: 1,
    },
    goalsSection: {
      marginBottom: spacing.lg,
    },
    sectionLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    emptyGoalsText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.lg,
      fontStyle: "italic",
    },
    goalCard: {
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      ...shadows.glass,
    },
    goalCardSelected: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}12`,
    },
    goalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    goalTitle: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "600",
      fontSize: 16,
      color: colors.textPrimary,
    },
    goalStatus: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      color: colors.accent,
    },
    goalStatusMuted: {
      color: colors.textSecondary,
    },
    goalDescription: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    goalFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    goalFooterExpanded: {
      gap: spacing.xs,
    },
    progressTrack: {
      height: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: {
      height: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
    },
    goalMetricsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    goalMetricText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    goalBadgeState: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      color: colors.textSecondary,
    },
    goalBadgeState_alive: {
      backgroundColor: `${colors.accent}1A`,
      color: colors.accent,
    },
    goalBadgeState_dormant: {
      backgroundColor: `${colors.textSecondary}1A`,
      color: colors.textSecondary,
    },
    goalBadgeState_misaligned: {
      backgroundColor: `${colors.error}1A`,
      color: colors.error,
    },
    goalBadgeState_complete: {
      backgroundColor: `${colors.accent}14`,
      color: colors.accent,
    },
    goalProgress: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.accent,
      fontWeight: "600",
    },
    goalSteps: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    detailCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    detailTitle: {
      fontFamily: typography.heading.fontFamily,
      fontSize: 22,
      color: colors.textPrimary,
    },
    detailCategory: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    statusChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusChipActive: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}1A`,
    },
    statusChipText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    statusChipTextActive: {
      color: colors.accent,
      fontWeight: "600",
    },
    anchorButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.lg,
      backgroundColor: `${colors.accent}14`,
      marginBottom: spacing.md,
    },
    anchorButtonText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.accent,
      fontWeight: "600",
    },
    healthDetailSection: {
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    badgesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    badgeChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.lg,
      backgroundColor: `${colors.accent}14`,
    },
    badgeChipText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      color: colors.accent,
    },
    sectionHeading: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      textTransform: "uppercase",
    },
    reflectionCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.xs,
    },
    reflectionNote: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textPrimary,
    },
    reflectionMeta: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      color: colors.textSecondary,
    },
    stepsContainer: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    stepRowCompleted: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}14`,
    },
    stepText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textPrimary,
    },
    stepTextCompleted: {
      color: colors.accent,
      textDecorationLine: "line-through",
    },
    emptySteps: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    addStepRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    stepInput: {
      flex: 1,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    addStepButton: {
      width: 42,
      height: 42,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailFooter: {
      marginTop: spacing.lg,
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    deleteGoalButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    deleteGoalText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.error,
      textTransform: "uppercase",
    },
    emptyDetail: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyDetailText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
    },
  });

export default GoalsPanel;
