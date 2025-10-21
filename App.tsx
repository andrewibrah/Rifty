import "react-native-gesture-handler";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  type PanResponderGestureState,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { Session } from "@supabase/supabase-js";
import ChatHeader from "./src/components/chat/ChatHeader";
import MessageBubble from "./src/components/chat/MessageBubble";
import MessageInput from "./src/components/chat/MessageInput";
import MenuModal from "./src/components/modals/MenuModal";
import SettingsScreen from "./src/screens/SettingsScreen";
import ScheduleCalendarModal from "./src/components/modals/ScheduleCalendarModal";
import OnboardingFlow from "./src/screens/onboarding/OnboardingFlow";
import PersonalizationModal from "./src/components/PersonalizationModal";
import PersonalizationSettingsScreen from "./src/screens/settings/PersonalizationSettingsScreen";
import Auth from "./src/components/Auth";
import IntentReviewModal from "./src/components/modals/IntentReviewModal";
import {
  useChatState,
  type IntentReviewTicket,
} from "./src/hooks/useChatState";
import { useMenuState } from "./src/hooks/useMenuState";
import type { ChatMessage, MessageGroup } from "./src/types/chat";
import type { MainHistoryRecord } from "./src/types/history";
import { getColors, spacing, radii, typography, shadows } from "./src/theme";
import { useTheme } from "./src/contexts/ThemeContext";
import { supabase } from "./src/lib/supabase";
import purgeLocal from "./src/utils/purgeLocal";
import Constants from "expo-constants";
import { ThemeProvider } from "./src/contexts/ThemeContext";
import { usePersonalization } from "./src/hooks/usePersonalization";
import type {
  PersonalizationBundle,
  PersonalizationState,
  PersonaTag,
} from "./src/types/personalization";
import { useEventLog } from "./src/hooks/useEventLog";
import {
  allIntentDefinitions,
  getIntentById,
  type AppIntent,
} from "./src/constants/intents";
import {
  CURRENT_SESSION_STORAGE_KEY,
  MAIN_HISTORY_STORAGE_KEY,
  SESSION_STATS_STORAGE_KEY,
} from "./src/constants/storage";
import { logIntentAudit } from "./src/services/data";
import { Memory } from "./src/agent/memory";
import {
  createChatSession,
  updateChatSession,
} from "./src/services/chatSessions";
import { updateProfileStats } from "./src/services/profile";
import { generateSessionMetadata } from "./src/services/sessionMetadata";
import {
  formatDateKey,
  getDayNumber,
  getMinutesSinceMidnight,
} from "./src/utils/timezone";
import { generateUUID } from "./src/utils/id";
import CheckInBanner from "./src/components/CheckInBanner";
import { getPendingCheckIn, completeCheckIn } from "./src/services/checkIns";
import type { CheckIn } from "./src/types/mvp";

const MIGRATION_FLAG =
  String(
    (Constants.expoConfig?.extra as Record<string, any> | undefined)
      ?.MIGRATION_2025_10_REMOVE_LOCAL_DB
  )
    .toLowerCase()
    .trim() === "true";

const SESSION_ROTATION_CHECK_INTERVAL = 45 * 1000;

interface StoredSession {
  id: string;
  startedAt: string;
  lastMessageAt?: string;
  messageCount: number;
}

interface SessionStats {
  missedDayCount: number;
  currentStreak: number;
  lastMessageAt?: string | null;
}

interface ChatScreenProps {
  session: Session;
  personalization: PersonalizationBundle | null;
  onSavePersonalization: (
    state: PersonalizationState,
    timezone: string
  ) => Promise<PersonaTag>;
  onRefreshPersonalization: () => Promise<void>;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
  session,
  personalization,
  onSavePersonalization,
  onRefreshPersonalization,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = createStyles(colors);
  const listRef = useRef<FlatList<MessageGroup>>(null);
  // Menu state for refreshing entry counts
  const menuState = useMenuState();

  const {
    messages,
    messageGroups,
    sendMessage,
    retryMessage,
    clearMessages,
    updateMessageIntent,
  } = useChatState(menuState.refreshAllEntryCounts, {
    onBotMessage: () => {
      handleBotActivity().catch((error) => {
        console.warn("[ChatSession] bot activity tracking failed", error);
      });
    },
  });

  const [content, setContent] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<
    "chat" | "settings" | "personalization"
  >("chat");
  const [intentReviewQueue, setIntentReviewQueue] = useState<
    IntentReviewTicket[]
  >([]);
  const [activeIntentReview, setActiveIntentReview] =
    useState<IntentReviewTicket | null>(null);
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<CheckIn | null>(null);
  const lastCheckInRef = useRef<CheckIn | null>(null);
  const [activeCheckInId, setActiveCheckInId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<StoredSession | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const timezoneRef = useRef<string>("UTC");
  const sessionInfoRef = useRef<StoredSession | null>(null);
  const sessionStatsRef = useRef<SessionStats | null>(null);
  const rotationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  useEffect(() => {
    sessionInfoRef.current = sessionInfo;
  }, [sessionInfo]);

  useEffect(() => {
    sessionStatsRef.current = sessionStats;
  }, [sessionStats]);

  const loadPendingCheckIn = useCallback(async () => {
    if (personalization?.settings?.checkin_notifications === false) {
      setPendingCheckIn(null);
      return;
    }
    try {
      const pending = await getPendingCheckIn();
      setPendingCheckIn(pending ?? null);
    } catch (error) {
      console.warn("[CheckIn] load failed", error);
    }
  }, [personalization?.settings?.checkin_notifications]);

  const loadSessionFromStorage =
    useCallback(async (): Promise<StoredSession | null> => {
      try {
        const raw = await AsyncStorage.getItem(CURRENT_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredSession;
      if (parsed && parsed.id && parsed.startedAt) {
        const nextSession: StoredSession = {
          id: parsed.id,
          startedAt: parsed.startedAt,
          messageCount: Number(parsed.messageCount ?? 0),
        };
        if (parsed.lastMessageAt) {
          nextSession.lastMessageAt = parsed.lastMessageAt;
        }
        return nextSession;
      }
      } catch (error) {
        console.warn("[ChatSession] failed to load session", error);
      }
      return null;
    }, []);

  const saveSessionToStorage = useCallback(
    async (session: StoredSession | null) => {
      try {
        if (!session) {
          await AsyncStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
          return;
        }
        await AsyncStorage.setItem(
          CURRENT_SESSION_STORAGE_KEY,
          JSON.stringify(session)
        );
      } catch (error) {
        console.warn("[ChatSession] failed to persist session", error);
      }
    },
    []
  );

  const loadStatsFromStorage =
    useCallback(async (): Promise<SessionStats | null> => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_STATS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SessionStats;
        if (parsed) {
          return {
            missedDayCount: Number(parsed.missedDayCount ?? 0),
            currentStreak: Number(parsed.currentStreak ?? 0),
            lastMessageAt: parsed.lastMessageAt ?? null,
          };
        }
      } catch (error) {
        console.warn("[ChatSession] failed to load stats", error);
      }
      return null;
    }, []);

  const saveStatsToStorage = useCallback(async (stats: SessionStats | null) => {
    try {
      if (!stats) {
        await AsyncStorage.removeItem(SESSION_STATS_STORAGE_KEY);
        return;
      }
      await AsyncStorage.setItem(
        SESSION_STATS_STORAGE_KEY,
        JSON.stringify(stats)
      );
    } catch (error) {
      console.warn("[ChatSession] failed to persist stats", error);
    }
  }, []);

  const shouldRotateSession = useCallback(
    (session: StoredSession, now: Date, timezone: string) => {
      const sessionDay = getDayNumber(new Date(session.startedAt), timezone);
      const nowDay = getDayNumber(now, timezone);
      if (nowDay - sessionDay > 1) {
        return true;
      }
      if (nowDay > sessionDay) {
        const minutes = getMinutesSinceMidnight(now, timezone);
        if (minutes >= 120) {
          return true;
        }
      }
      if (session.lastMessageAt) {
        const lastActivityDay = getDayNumber(
          new Date(session.lastMessageAt),
          timezone
        );
        if (nowDay - lastActivityDay > 1) {
          return true;
        }
        if (nowDay > lastActivityDay) {
          const minutes = getMinutesSinceMidnight(now, timezone);
          if (minutes >= 120) {
            return true;
          }
        }
      }
      return false;
    },
    []
  );

  const startNewSession = useCallback(
    async (timezone: string): Promise<StoredSession> => {
      const now = new Date();
      const session: StoredSession = {
        id: generateUUID(),
        startedAt: now.toISOString(),
        messageCount: 0,
      };
      try {
        await createChatSession({
          id: session.id,
          sessionDate: formatDateKey(now, timezone),
          startedAt: session.startedAt,
          messageCount: 0,
        });
      } catch (error) {
        console.warn("[ChatSession] failed to create", error);
      }
      sessionInfoRef.current = session;
      setSessionInfo(session);
      await saveSessionToStorage(session);
      return session;
    },
    [saveSessionToStorage]
  );

  const incrementSessionMessageCount = useCallback(
    async (delta: number, lastMessageIso?: string) => {
      const timezone = timezoneRef.current;
      let session = sessionInfoRef.current;
      if (!session) {
        session = await loadSessionFromStorage();
        if (session) {
          sessionInfoRef.current = session;
          setSessionInfo(session);
        }
      }
      if (!session) {
        session = await startNewSession(timezone);
      }
      const updated: StoredSession = {
        ...session,
        messageCount: Math.max(0, (session.messageCount ?? 0) + delta),
      };
      if (lastMessageIso) {
        updated.lastMessageAt = lastMessageIso;
      } else if (session.lastMessageAt) {
        updated.lastMessageAt = session.lastMessageAt;
      }
      sessionInfoRef.current = updated;
      setSessionInfo(updated);
      await saveSessionToStorage(updated);
      try {
        await updateChatSession(updated.id, {
          messageCount: updated.messageCount,
        });
      } catch (error) {
        console.warn("[ChatSession] failed to sync count", error);
      }
    },
    [loadSessionFromStorage, saveSessionToStorage, startNewSession]
  );

  const handleBotActivity = useCallback(async () => {
    await incrementSessionMessageCount(1);
  }, [incrementSessionMessageCount]);

  const handleUserActivity = useCallback(
    async (sentAt: Date) => {
      await incrementSessionMessageCount(1, sentAt.toISOString());

      const timezone = timezoneRef.current;
      const stats = sessionStatsRef.current ?? {
        missedDayCount:
          personalization?.profile.missed_day_count !== undefined
            ? personalization.profile.missed_day_count
            : 0,
        currentStreak:
          personalization?.profile.current_streak !== undefined
            ? personalization.profile.current_streak
            : 0,
        lastMessageAt: personalization?.profile.last_message_at ?? null,
      };

      let nextMissed = stats.missedDayCount ?? 0;
      let nextStreak = stats.currentStreak ?? 0;

      if (stats.lastMessageAt) {
        const lastDay = getDayNumber(new Date(stats.lastMessageAt), timezone);
        const currentDay = getDayNumber(sentAt, timezone);
        const diff = currentDay - lastDay;
        if (diff === 0) {
          if (nextStreak <= 0) {
            nextStreak = 1;
          }
        } else if (diff === 1) {
          nextStreak = Math.max(1, nextStreak + 1);
        } else if (diff > 1) {
          nextMissed += diff - 1;
          nextStreak = 1;
        }
      } else {
        nextStreak = Math.max(1, nextStreak + 1);
      }

      const nextStats: SessionStats = {
        missedDayCount: nextMissed,
        currentStreak: nextStreak,
        lastMessageAt: sentAt.toISOString(),
      };
      sessionStatsRef.current = nextStats;
      setSessionStats(nextStats);
      await saveStatsToStorage(nextStats);

      try {
        await updateProfileStats({
          missed_day_count: nextMissed,
          current_streak: nextStreak,
          last_message_at: sentAt.toISOString(),
        });
      } catch (error) {
        console.warn("[Profile] failed to update stats", error);
      }
    },
    [incrementSessionMessageCount, personalization, saveStatsToStorage]
  );

  const archiveConversation = useCallback(
    async (options?: { reason?: "manual" | "auto"; endedAt?: Date }) => {
      const currentSession = sessionInfoRef.current;
      const endedAt = options?.endedAt ?? new Date();
      const timezone = timezoneRef.current;
      const snapshot: ChatMessage[] = JSON.parse(JSON.stringify(messages));
      const messageCount = currentSession?.messageCount ?? snapshot.length;

      if (messageCount === 0) {
        sessionInfoRef.current = null;
        setSessionInfo(null);
        await saveSessionToStorage(null);
        return null;
      }

      let metadata = await generateSessionMetadata(snapshot).catch(() => {
        const fallbackSource = snapshot.find((msg) => msg.kind !== "bot") ??
          snapshot[0];
        const title = fallbackSource?.content
          ? fallbackSource.content.slice(0, 40)
          : "Reflection";
        return {
          title,
          summary: "Conversation summary unavailable.",
          confidence: 0.2,
        };
      });

      if (!metadata.title || metadata.title.trim().length === 0) {
        metadata = {
          ...metadata,
          title: "Reflection",
        };
      }

      const record: MainHistoryRecord = {
        id: currentSession?.id ?? generateUUID(),
        timestamp: endedAt.toISOString(),
        title: metadata.title,
        summary: metadata.summary,
        aiTitleConfidence: metadata.confidence,
        messageCount,
        messages: snapshot,
      };

      try {
        const raw = await AsyncStorage.getItem(MAIN_HISTORY_STORAGE_KEY);
        const history: MainHistoryRecord[] = raw ? JSON.parse(raw) : [];
        const next = [record, ...history].slice(0, 50);
        await AsyncStorage.setItem(
          MAIN_HISTORY_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch (error) {
        console.error("Failed to archive conversation", error);
      }

      if (currentSession) {
        try {
          await updateChatSession(currentSession.id, {
            endedAt: endedAt.toISOString(),
            title: metadata.title,
            summary: metadata.summary,
            messageCount,
            aiTitleConfidence: metadata.confidence,
          });
        } catch (error) {
          console.warn("[ChatSession] finalize failed", error);
        }
      } else {
        try {
          await createChatSession({
            id: record.id,
            sessionDate: formatDateKey(endedAt, timezone),
            startedAt: endedAt.toISOString(),
            title: metadata.title,
            summary: metadata.summary,
            messageCount,
            aiTitleConfidence: metadata.confidence,
          });
        } catch (error) {
          console.warn("[ChatSession] backfill create failed", error);
        }
      }

      sessionInfoRef.current = null;
      setSessionInfo(null);
      await saveSessionToStorage(null);

      return record;
    },
    [messages, saveSessionToStorage]
  );

  const maybeRotateSession = useCallback(
    async (timezone: string, forcedNow?: Date) => {
      const session = sessionInfoRef.current;
      if (!session) return;
      const now = forcedNow ?? new Date();
      if (!shouldRotateSession(session, now, timezone)) {
        return;
      }

      const hasMessages = messages.length > 0 || session.messageCount > 0;

      if (hasMessages) {
        await archiveConversation({ reason: "auto", endedAt: now });
        clearMessages();
      } else {
        sessionInfoRef.current = null;
        setSessionInfo(null);
        await saveSessionToStorage(null);
      }

      await startNewSession(timezone);
    },
    [
      archiveConversation,
      clearMessages,
      messages.length,
      saveSessionToStorage,
      shouldRotateSession,
      startNewSession,
    ]
  );

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const flameTranslate = useRef(new Animated.Value(0)).current;
  const flameScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const flameLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(flameTranslate, {
            toValue: -12,
            duration: 450,
            useNativeDriver: true,
          }),
          Animated.timing(flameScale, {
            toValue: 1.1,
            duration: 450,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(flameTranslate, {
            toValue: 0,
            duration: 450,
            useNativeDriver: true,
          }),
          Animated.timing(flameScale, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    flameLoop.start();

    return () => {
      flameLoop.stop();
    };
  }, [flameScale, flameTranslate]);

  useEffect(() => {
    if (!personalization || !isSplashVisible) return;

    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      setIsSplashVisible(false);
    });
  }, [isSplashVisible, personalization, splashOpacity]);

  useEffect(() => {
    if (!personalization) return;

    const timezone = personalization.profile.timezone || "UTC";
    timezoneRef.current = timezone;
    let cancelled = false;

    const bootstrap = async () => {
      const storedStats = await loadStatsFromStorage();
      if (!cancelled) {
        if (storedStats) {
          sessionStatsRef.current = storedStats;
          setSessionStats(storedStats);
        } else {
          const fallbackStats: SessionStats = {
            missedDayCount: personalization.profile.missed_day_count ?? 0,
            currentStreak: personalization.profile.current_streak ?? 0,
            lastMessageAt: personalization.profile.last_message_at ?? null,
          };
          sessionStatsRef.current = fallbackStats;
          setSessionStats(fallbackStats);
          await saveStatsToStorage(fallbackStats);
        }
      }

      let session = await loadSessionFromStorage();
      if (cancelled) return;

      if (session) {
        sessionInfoRef.current = session;
        setSessionInfo(session);
        await maybeRotateSession(timezone);
      } else {
        await startNewSession(timezone);
      }
    };

    bootstrap();

    if (rotationIntervalRef.current) {
      clearInterval(rotationIntervalRef.current);
    }

    rotationIntervalRef.current = setInterval(() => {
      maybeRotateSession(timezoneRef.current);
    }, SESSION_ROTATION_CHECK_INTERVAL);

    return () => {
      cancelled = true;
      if (rotationIntervalRef.current) {
        clearInterval(rotationIntervalRef.current);
        rotationIntervalRef.current = null;
      }
    };
  }, [
    personalization,
    loadStatsFromStorage,
    saveStatsToStorage,
    loadSessionFromStorage,
    maybeRotateSession,
    startNewSession,
  ]);

  useEffect(() => {
    if (activeIntentReview) return;
    const [nextReview, ...rest] = intentReviewQueue;
    if (!nextReview) return;
    setActiveIntentReview(nextReview);
    setIntentReviewQueue(rest);
  }, [activeIntentReview, intentReviewQueue]);

  useEffect(() => {
    Memory.warmup().catch((error) => {
      console.warn("[memory] warmup failed", error);
    });
  }, []);

  useEffect(() => {
    loadPendingCheckIn();
  }, [loadPendingCheckIn]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        maybeRotateSession(timezoneRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [maybeRotateSession]);

  const handleSend = async () => {
    try {
      const trimmed = content.trim();
      if (!trimmed) return;
      const timezone = timezoneRef.current;
      await maybeRotateSession(timezone);

      const sentAt = new Date();
      await handleUserActivity(sentAt);

      const review = await sendMessage(trimmed);
      setContent("");
      if (review) {
        setIntentReviewQueue((prev) => [...prev, review]);
      }
      if (activeCheckInId) {
        try {
          await completeCheckIn(activeCheckInId, { response: trimmed });
          setActiveCheckInId(null);
          lastCheckInRef.current = null;
          loadPendingCheckIn();
        } catch (checkInError) {
          console.warn("[CheckIn] completion failed", checkInError);
          const previousCheckIn = lastCheckInRef.current;
          if (previousCheckIn) {
            setPendingCheckIn(previousCheckIn);
          }
          setActiveCheckInId(null);
          Alert.alert(
            "Check-in Failed",
            "Could not save your response. Try again?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Retry",
                onPress: () => {
                  if (previousCheckIn) {
                    setPendingCheckIn(previousCheckIn);
                    handleRespondCheckIn();
                  }
                },
              },
            ]
          );
        }
      }

      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } catch (error) {
      console.error("[ChatScreen] handleSend failed", error);
      // Don't clear content on error so user can retry
    }
  };

  const handleRetry = (messageId: string) => {
    retryMessage(messageId);
  };

  const handleMessageLongPress = useCallback(
    (message: ChatMessage) => {
      if (message.kind === "entry") {
        Alert.alert(
          "Navigate to Entry",
          "Would you like to view this entry in detail?",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "View Entry",
              onPress: () => {
                // Open the menu and navigate to the entry
                setShowMenu(true);
                menuState.handleSelectEntry(message.id);
              },
            },
          ]
        );
      }
    },
    [menuState]
  );


  const renderItem = ({
    item: group,
  }: {
    item: MessageGroup;
    index: number;
  }) => (
    <View style={styles.messageGroup}>
      {group.messages.map((message, msgIndex) => (
        <MessageBubble
          key={message.id}
          message={message}
          isPartOfGroup={msgIndex !== 0}
          showTimestamp={msgIndex === group.messages.length - 1}
          onRetry={handleRetry}
          onLongPress={handleMessageLongPress}
        />
      ))}
    </View>
  );

  // Gesture handling for swipe to open menu
  const mainContentTranslateX = useRef(new Animated.Value(0)).current;
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [gestureProgress, setGestureProgress] = useState(0);


  // Handle clear chat with confirmation
  const handleClearChat = useCallback(() => {
    Alert.alert(
      "Clear Chat",
      "Are you sure you want to clear the chat? This will remove all messages from the current conversation.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await archiveConversation({ reason: "manual" });
            } finally {
              clearMessages();
              await startNewSession(timezoneRef.current);
            }
          },
        },
      ]
    );
  }, [archiveConversation, clearMessages, startNewSession]);

  const handleIntentConfirm = useCallback(
    (messageId: string, correctIntent: string, displayLabel?: string) => {
      if (correctIntent !== "unknown") {
        const isCustom = correctIntent.startsWith("custom:");
        const baseDefinition = getIntentById(
          (isCustom ? "unknown" : correctIntent) as AppIntent
        );
        const label = (
          displayLabel ??
          (isCustom
            ? correctIntent
                .replace(/^custom:/, "")
                .replace(/[-_]+/g, " ")
                .trim() || "Custom Intent"
            : baseDefinition.label)
        ).trim();
        const metaId = isCustom
          ? ("unknown" as AppIntent)
          : (correctIntent as AppIntent);
        const confidence =
          activeIntentReview && correctIntent === activeIntentReview.intent.id
            ? activeIntentReview.intent.confidence
            : 1;

        const probabilities = activeIntentReview
          ? {
              ...activeIntentReview.intent.probabilities,
              [label]:
                correctIntent === activeIntentReview.intent.id
                  ? (activeIntentReview.intent.probabilities[label] ??
                    confidence)
                  : 1,
            }
          : {};

        const meta = {
          id: metaId,
          rawLabel: label,
          displayLabel: label,
          confidence,
          subsystem: baseDefinition.subsystem,
          probabilities,
        };

        const resolvedType = activeIntentReview
          ? (baseDefinition.entryType ?? activeIntentReview.entryType)
          : "journal";

        updateMessageIntent(messageId, meta, resolvedType);
      }

      setActiveIntentReview(null);
    },
    [activeIntentReview, updateMessageIntent]
  );

  const handleIntentModalClose = useCallback(() => {
    setActiveIntentReview(null);
  }, []);

  const animateMainContent = useCallback(
    (toValue: number) => {
      Animated.spring(mainContentTranslateX, {
        toValue,
        useNativeDriver: true,
        tension: 120,
        friction: 9,
      }).start();
    },
    [mainContentTranslateX]
  );

  // Reset main content position when menu closes
  const handleMenuClose = useCallback(() => {
    setShowMenu(false);
    setIsGestureActive(false);
    setGestureProgress(0);
    animateMainContent(0);
  }, [animateMainContent]);

  // Handle menu button press with same animation
  const handleMenuButtonPress = useCallback(() => {
    setShowMenu(true);
    animateMainContent(300);
  }, [animateMainContent]);

  const finalizePanGesture = useCallback(
    (gestureState: PanResponderGestureState) => {
      setIsGestureActive(false);
      setGestureProgress(0);

      const translationX = Math.max(0, Math.min(gestureState.dx, 300));
      const velocityX = gestureState.vx ?? 0;
      const shouldOpen = translationX > 50 || velocityX > 0.5;

      if (shouldOpen) {
        setShowMenu(true);
        animateMainContent(300);
      } else {
        animateMainContent(0);
        setShowMenu(false);
      }
    },
    [animateMainContent]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          const { dx, dy, moveX, x0 } = gestureState;
          const startX = x0 ?? moveX ?? evt.nativeEvent.pageX;
          const EDGE_ACTIVATION_WIDTH = 48;
          const isFromEdge = startX <= EDGE_ACTIVATION_WIDTH;
          const hasHorizontalIntent = dx > 15 && Math.abs(dy) < 30;
          return isFromEdge && hasHorizontalIntent;
        },
        onPanResponderGrant: () => {
          setIsGestureActive(true);
          setShowMenu(true);
        },
        onPanResponderMove: (_evt, gestureState) => {
          const clampedTranslation = Math.max(
            0,
            Math.min(gestureState.dx, 300)
          );
          mainContentTranslateX.setValue(clampedTranslation);

          const progress = Math.min(Math.max(clampedTranslation / 300, 0), 1);
          setGestureProgress(progress);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          finalizePanGesture(gestureState);
        },
        onPanResponderTerminate: (_evt, gestureState) => {
          finalizePanGesture(gestureState);
        },
      }),
    [finalizePanGesture, mainContentTranslateX]
  );

  const handleCalendarButtonPress = useCallback(() => {
    setShowCalendar(true);
  }, []);

  const handleCalendarClose = useCallback(() => {
    setShowCalendar(false);
  }, []);

  const handleScheduleTemplatePress = useCallback(() => {
    const scheduleTemplate = "Place | Time | Reason";
    setContent(scheduleTemplate);
  }, []);

  const handleSettingsPress = useCallback(() => {
    setCurrentScreen("settings");
  }, []);

  const handleSettingsBack = useCallback(() => {
    setCurrentScreen("chat");
  }, []);

  const handlePersonalizationPress = useCallback(() => {
    if (!personalization) {
      Alert.alert("Loading", "Personalization details are still syncing.");
      return;
    }
    setCurrentScreen("personalization");
  }, [personalization]);

  const handlePersonalizationBack = useCallback(() => {
    setCurrentScreen("settings");
  }, []);

  const handlePersonalizationClose = useCallback(() => {
    setShowPersonalization(false);
  }, []);

  const handleRespondCheckIn = useCallback(() => {
    if (!pendingCheckIn) return;
    lastCheckInRef.current = pendingCheckIn;
    setActiveCheckInId(pendingCheckIn.id);
    setContent(`${pendingCheckIn.prompt} `);
    setPendingCheckIn(null);
  }, [pendingCheckIn]);

  const handleDismissCheckIn = useCallback(() => {
    setPendingCheckIn(null);
  }, []);



  if (currentScreen === "settings") {
    return (
      <SettingsScreen
        onBack={handleSettingsBack}
        onPersonalizationPress={handlePersonalizationPress}
        session={session}
      />
    );
  }

  if (currentScreen === "personalization" && personalization) {
    return (
      <PersonalizationSettingsScreen
        bundle={personalization}
        onClose={handlePersonalizationBack}
        onSave={async (state, timezone) => {
          const persona = await onSavePersonalization(state, timezone);
          await onRefreshPersonalization();
          Alert.alert("Saved", `Persona updated to ${persona}.`);
          return persona;
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.gestureContainer,
          { transform: [{ translateX: mainContentTranslateX }] },
        ]}
      >
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.flex}
          >
            <ChatHeader
              onHistoryPress={handleMenuButtonPress}
              onClearPress={handleClearChat}
              onCalendarPress={handleCalendarButtonPress}
              onScheduleTemplatePress={handleScheduleTemplatePress}
              hasContent={messages.length > 0}
            />

            <View style={styles.messageContainer}>
              {pendingCheckIn &&
                personalization?.settings?.checkin_notifications !== false && (
                  <CheckInBanner
                    type={pendingCheckIn.type}
                    prompt={pendingCheckIn.prompt}
                    onRespond={handleRespondCheckIn}
                    onDismiss={handleDismissCheckIn}
                  />
                )}
              {sessionStats?.missedDayCount &&
              sessionStats.missedDayCount > 0 &&
              personalization?.settings?.missed_day_notifications !== false ? (
                <View style={styles.missedDayAlert}>
                  <Ionicons
                    name="flame-outline"
                    size={16}
                    color={colors.accent}
                  />
                  <Text style={styles.missedDayText}>
                    {`You’ve missed ${sessionStats.missedDayCount} day${sessionStats.missedDayCount === 1 ? "" : "s"}. Let’s pick up where we left off.`}
                  </Text>
                </View>
              ) : null}
              {/* Background Logo */}
              <View style={styles.backgroundLogoContainer}>
                <Image
                  source={require("./assets/logo.png")}
                  style={[
                    styles.backgroundLogo,
                    {
                      tintColor: colors.textTertiary,
                      opacity: themeMode === "light" ? 0.3 : 0.1,
                    },
                  ]}
                  resizeMode="contain"
                />
              </View>
              <FlatList
                ref={listRef}
                data={messageGroups}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                style={styles.messageList}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={
                  Platform.OS === "ios" ? "interactive" : "on-drag"
                }
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
                removeClippedSubviews={false}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                onContentSizeChange={() => {
                  requestAnimationFrame(() => {
                    listRef.current?.scrollToEnd({ animated: false });
                  });
                }}
              />
            </View>

            <MessageInput
              content={content}
              onContentChange={setContent}
              onSend={handleSend}
              processingSteps={messages
                .filter(
                  (msg) => msg.kind === "entry" && msg.status === "sending"
                )
                .map((msg) => msg.processing || [])
                .flat()}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Animated.View>

      <MenuModal
        visible={showMenu}
        onClose={handleMenuClose}
        session={session}
        gestureProgress={isGestureActive ? gestureProgress : 1}
        menuState={menuState}
        onSettingsPress={handleSettingsPress}
      />

      <ScheduleCalendarModal
        visible={showCalendar}
        onClose={handleCalendarClose}
      />

      <IntentReviewModal
        visible={!!activeIntentReview}
        review={activeIntentReview}
        onClose={handleIntentModalClose}
        onConfirm={handleIntentConfirm}
      />

      <PersonalizationModal
        visible={showPersonalization}
        bundle={personalization}
        onClose={handlePersonalizationClose}
        onSave={async (state, timezone) => {
          const persona = await onSavePersonalization(state, timezone);
          await onRefreshPersonalization();
          Alert.alert("Saved", `Persona updated to ${persona}.`);
          return persona;
        }}
      />

      {isSplashVisible && (
        <Animated.View
          style={[styles.splashContainer, { opacity: splashOpacity }]}
          pointerEvents="none"
        >
          <View style={styles.splashContent}>
            <Image
              source={require("./assets/logo.png")}
              style={styles.splashLogo}
              resizeMode="contain"
            />
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    gestureContainer: {
      flex: 1,
    },
    authWrapper: {
      justifyContent: "center",
      alignItems: "center",
    },
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    authSafeArea: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
    },
    flex: {
      flex: 1,
      position: "relative",
    },
    messageContainer: {
      flex: 1,
      position: "relative",
    },
    missedDayAlert: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: `${colors.accent}12`,
      borderWidth: 1,
      borderColor: `${colors.accent}40`,
    },
    missedDayText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      flex: 1,
    },
    backgroundLogoContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
      pointerEvents: "none",
    },
    backgroundLogo: {
      width: 120,
      height: 120,
    },
    messageList: {
      flex: 1,
    },
    listContent: {
      flexGrow: 1,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      paddingTop: spacing.lg,
    },
    messageGroup: {
      marginBottom: spacing.lg,
    },
    splashContainer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    splashContent: {
      alignItems: "center",
      justifyContent: "center",
    },
    splashLogo: {
      width: 120,
      height: 120,
    },
  });

const LoadingScreen: React.FC = () => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = createStyles(colors);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    </View>
  );
};

const AuthScreen: React.FC = () => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = createStyles(colors);

  return (
    <View style={[styles.root, styles.authWrapper]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <SafeAreaView style={[styles.safeArea, styles.authSafeArea]}>
        <Auth />
      </SafeAreaView>
    </View>
  );
};

const AuthenticatedApp: React.FC<{ session: Session }> = ({ session }) => {
  const { replay } = useEventLog();
  const { data, loading, error, refresh, save } = usePersonalization();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);

  useEffect(() => {
    replay().catch((err) =>
      console.warn("Failed to replay persona signals", err)
    );
  }, [replay]);

  useEffect(() => {
    if (data?.profile.onboarding_completed) {
      setOnboardingComplete(true);
    }
  }, [data?.profile.onboarding_completed]);

  const initialTimezone =
    data?.profile.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !data) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
          Unable to load personalization.
        </Text>
        <TouchableOpacity
          onPress={refresh}
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: colors.accent,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!onboardingComplete) {
    return (
      <OnboardingFlow
        initialSettings={data.settings ?? null}
        initialTimezone={initialTimezone}
        onPersist={(state, timezone) =>
          save(state, timezone, "First-time onboarding", "onboarding")
        }
        onComplete={() => {
          setOnboardingComplete(true);
        }}
      />
    );
  }

  const handleSavePersonalization = async (
    state: PersonalizationState,
    timezone: string
  ) => {
    const persona = await save(
      state,
      timezone,
      "Settings update",
      "settings_update"
    );
    return persona;
  };

  return (
    <ChatScreen
      session={session}
      personalization={data}
      onSavePersonalization={handleSavePersonalization}
      onRefreshPersonalization={refresh}
    />
  );
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const purgeRequestedRef = useRef(false);

  useEffect(() => {
    let active = true;

    if (MIGRATION_FLAG && __DEV__ && !purgeRequestedRef.current) {
      purgeRequestedRef.current = true;
      purgeLocal().catch((error) => {
        console.warn("Failed to purge local storage", error);
      });
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        setCheckingSession(false);
      })
      .catch((error) => {
        console.error("Failed to load auth session", error);
        if (active) {
          setCheckingSession(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setCheckingSession(false);
    });

    const stateListener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      stateListener.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  if (checkingSession) {
    return (
      <ThemeProvider>
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  if (!session) {
    return (
      <ThemeProvider>
        <AuthScreen />
      </ThemeProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthenticatedApp session={session} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
