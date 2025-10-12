import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

type ExtraRecord = Record<string, unknown>

const extra = ((Constants.expoConfig?.extra as ExtraRecord | undefined) ??
  ((Constants.manifest2 as { extra?: ExtraRecord } | null)?.extra) ??
  {}) as ExtraRecord

const pickEnvValue = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

const SUPABASE_URL = pickEnvValue(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_URL,
  extra.EXPO_PUBLIC_SUPABASE_URL,
  extra.SUPABASE_URL
)

const SUPABASE_ANON_KEY = pickEnvValue(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY,
  extra.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  extra.SUPABASE_ANON_KEY
)

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: AsyncStorage,
    storageKey: 'riflett.supabase.auth',
  },
})
