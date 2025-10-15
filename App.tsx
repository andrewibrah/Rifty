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
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { Session } from "@supabase/supabase-js";
import ChatHeader from "./src/components/chat/ChatHeader";
import MessageBubble from "./src/components/chat/MessageBubble";
import TypingIndicator from "./src/components/chat/TypingIndicator";
import MessageInput from "./src/components/chat/MessageInput";
import MenuModal from "./src/components/modals/MenuModal";
import SettingsScreen from "./src/screens/SettingsScreen";
import ScheduleCalendarModal from "./src/components/modals/ScheduleCalendarModal";
import OnboardingFlow from "./src/screens/onboarding/OnboardingFlow";
import PersonalizationModal from "./src/components/PersonalizationModal";
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
import { MAIN_HISTORY_STORAGE_KEY } from "./src/constants/storage";
import { logIntentAudit } from "./src/services/data";
import { Memory } from "./src/agent/memory";

const SPLASH_DURATION = 2500;
const MIGRATION_FLAG =
  String(
    (Constants.expoConfig?.extra as Record<string, any> | undefined)
      ?.MIGRATION_2025_10_REMOVE_LOCAL_DB
  )
    .toLowerCase()
    .trim() === "true";

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
    isTyping,
    groupMessages,
    sendMessage,
    retryMessage,
    clearMessages,
    updateMessageIntent,
  } = useChatState(menuState.refreshAllEntryCounts);

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

    const timer = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setIsSplashVisible(false);
        flameLoop.stop();
      });
    }, SPLASH_DURATION);

    return () => {
      clearTimeout(timer);
      flameLoop.stop();
    };
  }, [flameScale, flameTranslate, splashOpacity]);

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

  const handleSend = async () => {
    try {
      const trimmed = content.trim();
      if (!trimmed) return;
      const review = await sendMessage(trimmed);
      setContent("");
      if (review) {
        setIntentReviewQueue((prev) => [...prev, review]);
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

  const messageGroups = groupMessages(messages);

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
        />
      ))}
    </View>
  );

  // Gesture handling for swipe to open menu
  const mainContentTranslateX = useRef(new Animated.Value(0)).current;
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [gestureProgress, setGestureProgress] = useState(0);

  const archiveConversation = useCallback(async () => {
    if (messages.length === 0) {
      return;
    }

    const snapshot: ChatMessage[] = JSON.parse(JSON.stringify(messages));

    const record: MainHistoryRecord = {
      id: `${Date.now()}`,
      timestamp: new Date().toISOString(),
      messages: snapshot,
    };

    try {
      const raw = await AsyncStorage.getItem(MAIN_HISTORY_STORAGE_KEY);
      const history: MainHistoryRecord[] = raw ? JSON.parse(raw) : [];
      const next = [record, ...history].slice(0, 20);
      await AsyncStorage.setItem(
        MAIN_HISTORY_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch (error) {
      console.error("Failed to archive conversation", error);
    }
  }, [messages]);

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
          onPress: () => {
            archiveConversation().finally(() => clearMessages());
          },
        },
      ]
    );
  }, [archiveConversation, clearMessages]);

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
              hasContent={messages.length > 0}
            />

            <View style={styles.messageContainer}>
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

            <TypingIndicator isVisible={isTyping} />

            <MessageInput
              content={content}
              onContentChange={setContent}
              onSend={handleSend}
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
          const persona = await onSavePersonalization(state, timezone)
          await onRefreshPersonalization()
          Alert.alert('Saved', `Persona updated to ${persona}.`)
          return persona
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
