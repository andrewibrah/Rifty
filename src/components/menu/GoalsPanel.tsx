import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { getColors, spacing, radii, typography, shadows } from '../../theme'
import {
  listGoals,
  updateGoal,
  deleteGoal,
  createGoal,
} from '../../services/goals'
import type { Goal, MicroStep, GoalStatus } from '../../types/mvp'
import { generateUUID } from '../../utils/id'

interface GoalsPanelProps {
  onClose: () => void
}

const MAX_ACTIVE_GOALS = 3

const statusOptions: GoalStatus[] = ['active', 'completed', 'paused', 'archived']

const GoalsPanel: React.FC<GoalsPanelProps> = ({ onClose }) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = useMemo(() => createStyles(colors), [colors])

  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [newStep, setNewStep] = useState('')
  const [creatingQuickGoal, setCreatingQuickGoal] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await listGoals({ limit: 100 })
      setGoals(results)
      if (!selectedGoalId && results.length > 0) {
        const active = results.find((goal) => goal.status === 'active')
        setSelectedGoalId(active?.id ?? results[0].id)
      }
    } catch (err) {
      console.error('[GoalsPanel] fetch failed', err)
      setError('Unable to load goals.')
    } finally {
      setLoading(false)
    }
  }, [selectedGoalId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null

  const handleSelectGoal = useCallback((goalId: string) => {
    setSelectedGoalId(goalId)
  }, [])

  const updateGoalList = useCallback((updated: Goal) => {
    setGoals((prev) => prev.map((goal) => (goal.id === updated.id ? updated : goal)))
  }, [])

  const handleToggleStep = useCallback(
    async (goal: Goal, step: MicroStep) => {
      const steps = goal.micro_steps.map((item) =>
        item.id === step.id
          ? {
              ...item,
              completed: !item.completed,
              completed_at: !item.completed ? new Date().toISOString() : undefined,
            }
          : item
      )
      try {
        const updated = await updateGoal(goal.id, { micro_steps: steps })
        updateGoalList(updated)
      } catch (err) {
        console.error('[GoalsPanel] toggle step failed', err)
        setError('Unable to update milestone.')
      }
    },
    [updateGoalList]
  )

  const handleAddStep = useCallback(async () => {
    if (!selectedGoal || !newStep.trim()) return
    const step: MicroStep = {
      id: generateUUID(),
      description: newStep.trim(),
      completed: false,
    }
    try {
      const updated = await updateGoal(selectedGoal.id, {
        micro_steps: [...selectedGoal.micro_steps, step],
      })
      updateGoalList(updated)
      setNewStep('')
    } catch (err) {
      console.error('[GoalsPanel] add step failed', err)
      setError('Unable to add milestone.')
    }
  }, [newStep, selectedGoal, updateGoalList])

  const handleStatusChange = useCallback(
    async (goal: Goal, status: GoalStatus) => {
      try {
        const updated = await updateGoal(goal.id, { status })
        updateGoalList(updated)
      } catch (err) {
        console.error('[GoalsPanel] status change failed', err)
        setError('Unable to update goal status.')
      }
    },
    [updateGoalList]
  )

  const handleDeleteGoal = useCallback(
    async (goalId: string) => {
      try {
        await deleteGoal(goalId)
        setGoals((prev) => prev.filter((goal) => goal.id !== goalId))
        if (selectedGoalId === goalId) {
          setSelectedGoalId(null)
        }
      } catch (err) {
        console.error('[GoalsPanel] delete failed', err)
        setError('Unable to delete goal.')
      }
    },
    [selectedGoalId]
  )

  const handleQuickCreate = useCallback(async () => {
    setCreatingQuickGoal(true)
    try {
      const activeGoals = goals.filter((goal) => goal.status === 'active').length
      if (activeGoals >= MAX_ACTIVE_GOALS) {
        setError('You already have three active goals. Archive one to create a new goal.')
        setCreatingQuickGoal(false)
        return
      }

      const created = await createGoal({
        title: 'New Goal',
        description: 'Clarify this goal and add milestones.',
        micro_steps: [],
      })
      setGoals((prev) => [created, ...prev])
      setSelectedGoalId(created.id)
    } catch (err) {
      console.error('[GoalsPanel] quick create failed', err)
      setError('Unable to create goal.')
    } finally {
      setCreatingQuickGoal(false)
    }
  }, [goals])

  const renderGoalCard = ({ item }: { item: Goal }) => {
    const completed = item.micro_steps.filter((step) => step.completed).length
    const total = item.micro_steps.length || 1
    const progress = Math.round((completed / total) * 100)
    const isActive = item.status === 'active'

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
          <Text style={[styles.goalStatus, !isActive && styles.goalStatusMuted]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
        {item.description ? (
          <Text style={styles.goalDescription}>{item.description}</Text>
        ) : null}
        <View style={styles.goalFooter}>
          <Text style={styles.goalProgress}>{`${progress}%`}</Text>
          <Text style={styles.goalSteps}>{`${completed}/${item.micro_steps.length || 0} milestones`}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  const renderStep = (goal: Goal, step: MicroStep) => (
    <TouchableOpacity
      key={step.id}
      style={[styles.stepRow, step.completed && styles.stepRowCompleted]}
      onPress={() => handleToggleStep(goal, step)}
    >
      <Ionicons
        name={step.completed ? 'checkmark-circle' : 'ellipse-outline'}
        size={18}
        color={step.completed ? colors.accent : colors.textSecondary}
      />
      <Text style={[styles.stepText, step.completed && styles.stepTextCompleted]}>
        {step.description}
      </Text>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Goals Dashboard</Text>
        <TouchableOpacity
          onPress={handleQuickCreate}
          style={styles.quickAddButton}
          disabled={creatingQuickGoal}
        >
          <Ionicons
            name="add-outline"
            size={20}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
      </View>
      {creatingQuickGoal && (
        <Text style={styles.hintText}>Creating quick goal…</Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : (
        <View style={styles.content}>
          <View style={styles.sidebar}>
            <Text style={styles.sidebarLabel}>Your Goals</Text>
            <FlatList
              data={goals}
              keyExtractor={(item) => item.id}
              renderItem={renderGoalCard}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
              showsVerticalScrollIndicator={false}
            />
          </View>
          <View style={styles.detailPane}>
            {selectedGoal ? (
              <View style={styles.detailCard}>
                <Text style={styles.detailTitle}>{selectedGoal.title}</Text>
                <Text style={styles.detailCategory}>
                  {selectedGoal.category || 'General focus'}
                </Text>

                <View style={styles.statusRow}>
                  {statusOptions.map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusChip,
                        selectedGoal.status === status && styles.statusChipActive,
                      ]}
                      onPress={() => handleStatusChange(selectedGoal, status)}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          selectedGoal.status === status && styles.statusChipTextActive,
                        ]}
                      >
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

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
            ) : (
              <View style={styles.emptyDetail}>
                <Text style={styles.emptyDetailText}>
                  Select a goal to see milestones and progress.
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickAddButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      fontSize: 20,
      color: colors.textPrimary,
    },
    hintText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
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
    content: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.lg,
    },
    sidebar: {
      width: Platform.select({ web: 260, default: 220 }),
    },
    sidebarLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    goalTitle: {
      fontFamily: typography.body.fontFamily,
      fontWeight: '600',
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    goalProgress: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.accent,
      fontWeight: '600',
    },
    goalSteps: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    detailPane: {
      flex: 1,
    },
    detailCard: {
      flex: 1,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
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
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    statusChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.xl,
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
      fontWeight: '600',
    },
    sectionHeading: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
    },
    stepsContainer: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
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
      textDecorationLine: 'line-through',
    },
    emptySteps: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    addStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
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
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailFooter: {
      marginTop: spacing.lg,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    deleteGoalButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    deleteGoalText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.error,
      textTransform: 'uppercase',
    },
    emptyDetail: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyDetailText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
    },
  })

export default GoalsPanel
