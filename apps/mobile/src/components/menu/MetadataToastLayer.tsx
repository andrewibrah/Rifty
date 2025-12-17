import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  NativeModules,
  Platform,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { getColors, spacing, radii, typography, shadows } from "@/theme";

export interface MetadataToastItem {
  id: string;
  latency: number | null;
  aiEventId?: string | null;
  createdAt: number;
}

interface MetadataToastLayerProps {
  toasts: MetadataToastItem[];
  copy: {
    latencyFast: string;
    latencyMedium: string;
    latencySlow: string;
    copyEventId: string;
  };
  onDismiss: (id: string) => void;
  onCopied?: (message: string) => void;
}

const TOAST_DURATION = 4500;

export function MetadataToastLayer({
  toasts,
  copy,
  onDismiss,
  onCopied,
}: MetadataToastLayerProps) {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const timers = useRef(new Map<string, NodeJS.Timeout>());

  useEffect(() => {
    const activeIds = new Set(toasts.map((toast) => toast.id));
    // Clear timers for removed toasts
    for (const [id, timer] of timers.current.entries()) {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }

    for (const toast of toasts) {
      if (!timers.current.has(toast.id)) {
        const timer = setTimeout(() => {
          onDismiss(toast.id);
          timers.current.delete(toast.id);
        }, TOAST_DURATION);
        timers.current.set(toast.id, timer);
      }
    }

    return () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }
      timers.current.clear();
    };
  }, [toasts, onDismiss]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.container}>
      {toasts.map((toast) => {
        const tier = determineLatencyTier(toast.latency);
        return (
          <Pressable
            key={toast.id}
            style={({ pressed }) => [
              styles.toast,
              styles[`tier${tier}` as const],
              pressed && styles.toastPressed,
            ]}
            onLongPress={async () => {
              if (!toast.aiEventId) return;
              try {
                const copied = await copyToClipboard(toast.aiEventId);
                if (copied) {
                  onCopied?.(copy.copyEventId);
                }
              } catch (error) {
                console.warn("[MetadataToast] copy failed", error);
              }
            }}
          >
            <Text style={styles.toastText}>
              {renderLatencyLabel(tier, copy)}
              {typeof toast.latency === "number"
                ? ` · ${toast.latency}ms`
                : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type LatencyTier = "Fast" | "Medium" | "Slow" | "Unknown";

function determineLatencyTier(latency: number | null): LatencyTier {
  if (latency === null || latency < 0) return "Unknown";
  if (latency < 500) return "Fast";
  if (latency <= 1500) return "Medium";
  return "Slow";
}

function renderLatencyLabel(tier: LatencyTier, copy: MetadataToastLayerProps["copy"]): string {
  switch (tier) {
    case "Fast":
      return copy.latencyFast;
    case "Medium":
      return copy.latencyMedium;
    case "Slow":
      return copy.latencySlow;
    default:
      return copy.latencyMedium;
  }
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      position: "absolute",
      bottom: spacing.xl * 2,
      right: spacing.lg,
      gap: spacing.xs,
    },
    toast: {
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.glass,
    },
    toastPressed: {
      transform: [{ scale: 0.97 }],
    },
    toastText: {
      ...typography.small,
      color: colors.textPrimary,
    },
    tierFast: {
      borderColor: colors.success,
    },
    tierMedium: {
      borderColor: colors.warning,
    },
    tierSlow: {
      borderColor: colors.textTertiary,
    },
    tierUnknown: {
      borderColor: colors.border,
    },
  });

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      const navigatorRef: any = (globalThis as any).navigator;
      if (navigatorRef?.clipboard?.writeText) {
        await navigatorRef.clipboard.writeText(text);
        return true;
      }
    }
    const clipboardModule =
      (NativeModules as any).Clipboard || (NativeModules as any).RNCClipboard;
    if (clipboardModule?.setString) {
      clipboardModule.setString(text);
      return true;
    }
  } catch (error) {
    console.warn("[MetadataToast] clipboard fallback failed", error);
  }
  return false;
}

export default MetadataToastLayer;
