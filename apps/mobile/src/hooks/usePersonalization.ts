import { useCallback, useEffect, useState } from 'react'
import { fetchPersonalizationBundle, persistPersonalization } from '../services/personalization'
import type {
  PersonaTag,
  PersonalizationState,
  PersonalizationBundle,
} from '../types/personalization'

interface UsePersonalizationResult {
  data: PersonalizationBundle | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  save: (state: PersonalizationState, timezone: string, rationale: string, source: 'onboarding' | 'settings_update') => Promise<PersonaTag>
}

export const usePersonalization = (): UsePersonalizationResult => {
  const [data, setData] = useState<PersonalizationBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const bundle = await fetchPersonalizationBundle()
      setData(bundle)
    } catch (err) {
      console.error('Failed to load personalization bundle', err)
      setError('Unable to load personalization details right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(
    async (state: PersonalizationState, timezone: string, rationale: string, source: 'onboarding' | 'settings_update') => {
      const persona = await persistPersonalization(state, {
        profileTimezone: timezone,
        onboardingCompleted: source === 'onboarding' ? true : Boolean(data?.profile.onboarding_completed),
        rationale,
        source,
      })
      await load()
      return persona
    },
    [data?.profile.onboarding_completed, load]
  )

  const refresh = useCallback(async () => {
    await load()
  }, [load])

  return {
    data,
    loading,
    error,
    refresh,
    save,
  }
}
