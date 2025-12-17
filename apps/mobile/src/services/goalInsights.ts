import { supabase } from '../lib/supabase'
import type { GoalReflection } from '../types/goal'

export interface GoalInsight {
  goal_id: string
  progress_pct: number
  coherence_score: number
  ghi_state: string
  reflections: GoalReflection[]
  badges: string[]
}

const BADGE_STABLE_MOMENTUM = 'Stable Momentum'
const BADGE_RENEWED_INTENT = 'Renewed Intent'
const BADGE_FADED_LINK = 'Faded Link'

function computeBadges(insight: GoalInsight): string[] {
  const badges: string[] = []
  const progressPct = insight.progress_pct ?? 0
  const coherence = insight.coherence_score ?? 0
  const ghi = insight.ghi_state ?? 'unknown'

  if (coherence >= 0.6 && progressPct >= 0.3) {
    badges.push(BADGE_STABLE_MOMENTUM)
  }

  const recentReflections = insight.reflections.filter((reflection) => {
    const createdAt = new Date(reflection.created_at).getTime()
    if (!Number.isFinite(createdAt)) return false
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return createdAt >= sevenDaysAgo
  })

  if (recentReflections.length >= 2) {
    badges.push(BADGE_RENEWED_INTENT)
  }

  if (ghi === 'misaligned' || ghi === 'dormant' || coherence < 0.35) {
    badges.push(BADGE_FADED_LINK)
  }

  return badges
}

export async function fetchGoalInsight(goalId: string): Promise<GoalInsight> {
  const [cacheResult, reflectionsResult] = await Promise.all([
    supabase
      .from('goal_progress_cache')
      .select('goal_id, progress_pct, coherence_score, ghi_state, last_computed_at')
      .eq('goal_id', goalId)
      .maybeSingle(),
    supabase
      .from('goal_reflections')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const cache = cacheResult.data ?? {
    goal_id: goalId,
    progress_pct: 0,
    coherence_score: 0,
    ghi_state: 'unknown',
  }

  if (cacheResult.error) {
    console.warn('[goalInsights] cache fetch error', cacheResult.error)
  }
  if (reflectionsResult.error) {
    console.warn('[goalInsights] reflections fetch error', reflectionsResult.error)
  }

  const insight: GoalInsight = {
    goal_id: goalId,
    progress_pct: cache.progress_pct ?? 0,
    coherence_score: cache.coherence_score ?? 0,
    ghi_state: cache.ghi_state ?? 'unknown',
    reflections: (reflectionsResult.data ?? []) as GoalReflection[],
    badges: [],
  }

  insight.badges = computeBadges(insight)
  return insight
}

export async function fetchGoalInsights(goalIds: string[]): Promise<Record<string, GoalInsight>> {
  const entries = await Promise.all(
    goalIds.map(async (goalId) => {
      try {
        const insight = await fetchGoalInsight(goalId)
        return [goalId, insight] as const
      } catch (error) {
        console.warn('[goalInsights] failed to fetch insight', goalId, error)
        return [goalId, {
          goal_id: goalId,
          progress_pct: 0,
          coherence_score: 0,
          ghi_state: 'unknown',
          reflections: [],
          badges: [],
        } as GoalInsight] as const
      }
    })
  )

  return Object.fromEntries(entries)
}
