import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Vibration,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { type EntryType } from "./src/services/data";
import ChatHeader from "./src/components/ChatHeader";
import MessageBubble from "./src/components/MessageBubble";
import TypingIndicator from "./src/components/TypingIndicator";
import MessageInput from "./src/components/MessageInput";
import HistoryModal from "./src/components/HistoryModal";
import Auth from "./src/components/Auth";
import { useChatState } from "./src/hooks/useChatState";
import type { MessageGroup } from "./src/types/chat";
import { colors, spacing, radii, typography, shadows } from "./src/theme";
import { supabase } from "./src/lib/supabase";
import purgeLocal from "./src/utils/purgeLocal";
import Constants from "expo-constants";

const SPLASH_DURATION = 2500;
const MIGRATION_FLAG = (
  String(
    (Constants.expoConfig?.extra as Record<string, any> | undefined)?.
      MIGRATION_2025_10_REMOVE_LOCAL_DB
  )
    .toLowerCase()
    .trim() === "true"
);

const ChatScreen: React.FC = () => {
  const listRef = useRef<FlatList<MessageGroup>>(null);
  const {
    messages,
    isTyping,
    groupMessages,
    sendMessage,
    retryMessage,
    clearMessages,
  } = useChatState();

  const [type, setType] = useState<EntryType>("journal");
  const [content, setContent] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);

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
        Vibration.vibrate(30);
      });
    }, SPLASH_DURATION);

    return () => {
      clearTimeout(timer);
      flameLoop.stop();
    };
  }, [flameScale, flameTranslate, splashOpacity]);

  const handleSend = async () => {
    if (!content.trim()) return;
    await sendMessage(content, type);
    setContent("");

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
        >
          <ChatHeader
            onHistoryPress={() => setShowHistory(true)}
            onClearPress={clearMessages}
            hasContent={messages.length > 0}
          />

          <View style={styles.messageContainer}>
            {messages.length === 0 && (
              <View style={styles.emptyStateContainer}>
                <Image
                  source={require("./assets/logo.png")}
                  style={styles.emptyStateLogo}
                  resizeMode="contain"
                />
              </View>
            )}
            <FlatList
              ref={listRef}
              data={messageGroups}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              style={styles.messageList}
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
            type={type}
            content={content}
            onTypeChange={setType}
            onContentChange={setContent}
            onSend={handleSend}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>

      <HistoryModal
        visible={showHistory}
        onClose={() => setShowHistory(false)}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
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
  backgroundGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: colors.accent,
    opacity: 0.08,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  messageContainer: {
    flex: 1,
    position: "relative",
  },
  emptyStateContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
  },
  emptyStateLogo: {
    width: 150,
    height: 150,
    opacity: 0.05,
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
  splashGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.accent,
    opacity: 0.15,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
  },
  splashLogo: {
    width: 120,
    height: 120,
  },
});

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
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.root, styles.authWrapper]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <SafeAreaView style={[styles.safeArea, styles.authSafeArea]}>
          <Auth />
        </SafeAreaView>
      </View>
    );
  }

  return <ChatScreen />;
};

export default App;
