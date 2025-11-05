import { useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import type { PersonaSignalPayload } from '../types/personalization'

const QUEUE_KEY = '@reflectify:persona_queue'

interface QueuedSignal {
  rationale: string
  payload: PersonaSignalPayload
  created_at: string
}

const flushQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    if (!raw) return
    const queue: QueuedSignal[] = JSON.parse(raw)
    if (!queue.length) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const remaining: QueuedSignal[] = []
    for (const item of queue) {
      try {
        const { error } = await supabase.from('persona_signals').insert({
          user_id: user.id,
          rationale: item.rationale,
          source: item.payload.source,
          payload: item.payload,
        })
        if (error) {
          console.warn('Failed to insert persona signal, re-queueing', error)
          remaining.push(item)
        }
      } catch (insertError) {
        console.warn('Persona signal insert threw, re-queueing', insertError)
        remaining.push(item)
      }
    }

    if (remaining.length > 0) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
    } else {
      await AsyncStorage.removeItem(QUEUE_KEY)
    }
  } catch (error) {
    console.warn('Failed to flush persona signal queue', error)
  }
}

export const useEventLog = () => {
  const logEvent = useCallback(async (rationale: string, payload: PersonaSignalPayload) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Missing user for event log')
      }
      await supabase
        .from('persona_signals')
        .insert({ user_id: user.id, rationale, source: payload.source, payload })
    } catch (error) {
      console.warn('Unable to persist persona signal immediately, queuing', error)
      try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY)
        const queue: QueuedSignal[] = raw ? JSON.parse(raw) : []
        queue.push({ rationale, payload, created_at: new Date().toISOString() })
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
      } catch (storageError) {
        console.error('Failed to queue persona signal', storageError)
      }
    }
  }, [])

  const replay = useCallback(async () => {
    await flushQueue()
  }, [])

  return { logEvent, replay }
}
