import { useState, useEffect, useCallback } from 'react'
import {
  getPendingCheckIn,
  completeCheckIn,
  scheduleDailyCheckIns,
  scheduleWeeklyCheckIn,
} from '../services/checkIns'
import type { CheckIn } from '../types/mvp'

export const useCheckIns = () => {
  const [pendingCheckIn, setPendingCheckIn] = useState<CheckIn | null>(null)
  const [loading, setLoading] = useState(false)

  const loadPendingCheckIn = useCallback(async () => {
    try {
      const checkIn = await getPendingCheckIn()
      setPendingCheckIn(checkIn)
    } catch (error) {
      console.error('Error loading pending check-in:', error)
    }
  }, [])

  useEffect(() => {
    loadPendingCheckIn()

    // Check for pending check-ins every 15 minutes
    const interval = setInterval(loadPendingCheckIn, 15 * 60 * 1000)

    return () => clearInterval(interval)
  }, [loadPendingCheckIn])

  const respondToCheckIn = useCallback(
    async (response: string, entryId?: string) => {
      if (!pendingCheckIn) return

      setLoading(true)
      try {
        await completeCheckIn(pendingCheckIn.id, {
          response,
          response_entry_id: entryId,
        })
        setPendingCheckIn(null)
        // Schedule next check-ins if needed
        await scheduleDailyCheckIns()
      } catch (error) {
        console.error('Error completing check-in:', error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [pendingCheckIn]
  )

  const dismissCheckIn = useCallback(() => {
    setPendingCheckIn(null)
  }, [])

  const initializeCheckIns = useCallback(async (timezone: string) => {
    try {
      await Promise.all([
        scheduleDailyCheckIns(timezone),
        scheduleWeeklyCheckIn(timezone),
      ])
    } catch (error) {
      console.error('Error initializing check-ins:', error)
    }
  }, [])

  return {
    pendingCheckIn,
    loading,
    respondToCheckIn,
    dismissCheckIn,
    initializeCheckIns,
    refresh: loadPendingCheckIn,
  }
}
