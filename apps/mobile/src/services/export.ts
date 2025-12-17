import { Share } from 'react-native'
import { supabase } from '../lib/supabase'
import { listJournals } from './data'
import { listGoals } from './goals'
import { searchAtomicMoments } from './atomicMoments'
import { listChatSessions } from './chatSessions'
import type { GoalReflection, GoalProgressCache, AIGoalSession, GoalAnchor } from '../types/goal'

export interface ExportPayloadV2 {
  version: 'goals-v2'
  generated_at: string
  journals: Awaited<ReturnType<typeof listJournals>>
  goals: Awaited<ReturnType<typeof listGoals>>
  atomic_moments: Awaited<ReturnType<typeof searchAtomicMoments>>
  sessions: Awaited<ReturnType<typeof listChatSessions>>
  goal_reflections: GoalReflection[]
  goal_progress_cache: Array<GoalProgressCache & { recorded_at: string }>
  ai_goal_sessions: AIGoalSession[]
  goal_anchors: GoalAnchor[]
}

const EXPORT_VERSION: ExportPayloadV2['version'] = 'goals-v2'

export async function exportUserData(): Promise<void> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [journals, goals, moments, sessions, reflectionsRes, cacheRes, aiSessionsRes, anchorsRes] =
    await Promise.all([
      listJournals({ limit: 1000 }),
      listGoals({ limit: 200 }),
      searchAtomicMoments({ limit: 200 }),
      listChatSessions(200),
      supabase
        .from('goal_reflections')
        .select('*')
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: false }),
      supabase
        .from('goal_progress_cache')
        .select('*')
        .order('last_computed_at', { ascending: false }),
      supabase
        .from('ai_goal_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('goal_anchors')
        .select('*')
        .order('scheduled_for', { ascending: true })
        .limit(200),
    ])

  if (reflectionsRes.error) {
    console.warn('[export] reflections fetch error', reflectionsRes.error)
  }
  if (cacheRes.error) {
    console.warn('[export] cache fetch error', cacheRes.error)
  }
  if (aiSessionsRes.error) {
    console.warn('[export] ai sessions fetch error', aiSessionsRes.error)
  }
  if (anchorsRes.error) {
    console.warn('[export] anchors fetch error', anchorsRes.error)
  }

  const progressTimeline = (cacheRes.data ?? []).map((row) => ({
    ...row,
    recorded_at: row.last_computed_at,
  })) as Array<GoalProgressCache & { recorded_at: string }>

  const payload: ExportPayloadV2 = {
    version: EXPORT_VERSION,
    generated_at: new Date().toISOString(),
    journals,
    goals,
    atomic_moments: moments,
    sessions,
    goal_reflections: (reflectionsRes.data ?? []) as GoalReflection[],
    goal_progress_cache: progressTimeline,
    ai_goal_sessions: (aiSessionsRes.data ?? []) as AIGoalSession[],
    goal_anchors: (anchorsRes.data ?? []) as GoalAnchor[],
  }

  const json = JSON.stringify(payload, null, 2)

  await Share.share({
    title: 'Riflett Data Export',
    message: json,
  })
}
