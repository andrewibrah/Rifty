/**
 * Operating Picture Context
 * 
 * Caches the operating picture and refreshes it periodically
 * to avoid expensive queries on every message send.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getOperatingPicture as fetchOperatingPicture } from '../services/memory';
import type { OperatingPicture } from '../types/memory';

interface OperatingPictureContextType {
  operatingPicture: OperatingPicture | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

const OperatingPictureContext = createContext<OperatingPictureContextType | undefined>(undefined);

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

interface Props {
  children: React.ReactNode;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function OperatingPictureProvider({ 
  children, 
  autoRefresh = true,
  refreshInterval = REFRESH_INTERVAL 
}: Props) {
  const [operatingPicture, setOperatingPicture] = useState<OperatingPicture | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const picture = await fetchOperatingPicture();
      setOperatingPicture(picture);
      setLastUpdated(new Date());
      console.log('[OperatingPicture] Refreshed successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch operating picture');
      setError(error);
      console.error('[OperatingPicture] Refresh failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;

    refreshTimerRef.current = setInterval(() => {
      console.log('[OperatingPicture] Auto-refresh triggered');
      refresh();
    }, refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, refresh]);

  const value: OperatingPictureContextType = {
    operatingPicture,
    isLoading,
    error,
    refresh,
    lastUpdated,
  };

  return (
    <OperatingPictureContext.Provider value={value}>
      {children}
    </OperatingPictureContext.Provider>
  );
}

export function useOperatingPicture(): OperatingPictureContextType {
  const context = useContext(OperatingPictureContext);
  if (context === undefined) {
    throw new Error('useOperatingPicture must be used within OperatingPictureProvider');
  }
  return context;
}

/**
 * Hook to get cached operating picture with staleness check
 */
export function useCachedOperatingPicture(): {
  picture: OperatingPicture | null;
  isStale: boolean;
  refresh: () => Promise<void>;
} {
  const { operatingPicture, lastUpdated, refresh } = useOperatingPicture();

  const isStale = lastUpdated 
    ? Date.now() - lastUpdated.getTime() > STALE_THRESHOLD
    : true;

  return {
    picture: operatingPicture,
    isStale,
    refresh,
  };
}

