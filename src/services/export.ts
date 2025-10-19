import { Share } from 'react-native'
import { listJournals } from './data'
import { listGoals } from './goals'
import { searchAtomicMoments } from './atomicMoments'
import { listChatSessions } from './chatSessions'

export interface ExportPayload {
  generated_at: string
  journals: ReturnType<typeof listJournals> extends Promise<infer T> ? T : never
  goals: ReturnType<typeof listGoals> extends Promise<infer T> ? T : never
  atomic_moments: ReturnType<typeof searchAtomicMoments> extends Promise<infer T> ? T : never
  sessions: ReturnType<typeof listChatSessions> extends Promise<infer T> ? T : never
}

export async function exportUserData(): Promise<void> {
  const [journals, goals, moments, sessions] = await Promise.all([
    listJournals({ limit: 1000 }),
    listGoals({ limit: 200 }),
    searchAtomicMoments({ limit: 200 }),
    listChatSessions(200),
  ])

  const payload = {
    generated_at: new Date().toISOString(),
    journals,
    goals,
    atomic_moments: moments,
    sessions,
  }

  const json = JSON.stringify(payload, null, 2)

  await Share.share({
    title: 'Riflett Data Export',
    message: json,
  })
}
