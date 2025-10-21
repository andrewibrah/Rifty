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

const configuredSupabaseUrl = pickEnvValue(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_URL,
  extra.EXPO_PUBLIC_SUPABASE_URL,
  extra.SUPABASE_URL
)

const configuredSupabaseAnonKey = pickEnvValue(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY,
  extra.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  extra.SUPABASE_ANON_KEY
)

const isDevEnvironment = (() => {
  if (typeof __DEV__ === 'boolean') {
    return __DEV__
  }
  const env = process.env.APP_ENV ?? process.env.NODE_ENV
  return env !== 'production'
})()

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SUPABASE_ANON_KEY = 'anon-key'

let resolvedSupabaseUrl = configuredSupabaseUrl
let resolvedSupabaseAnonKey = configuredSupabaseAnonKey

if ((!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) && isDevEnvironment) {
  resolvedSupabaseUrl = resolvedSupabaseUrl ?? LOCAL_SUPABASE_URL
  resolvedSupabaseAnonKey = resolvedSupabaseAnonKey ?? LOCAL_SUPABASE_ANON_KEY
  console.warn(
    '[supabase] Missing configuration, using local Supabase fallback at http://127.0.0.1:54321. '
      + 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to silence this message.'
  )
}

if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: AsyncStorage,
    storageKey: 'riflett.supabase.auth',
  },
})

export const SUPABASE_URL = resolvedSupabaseUrl
export const SUPABASE_ANON_KEY = resolvedSupabaseAnonKey
