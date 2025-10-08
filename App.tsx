import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import type { Session } from "@supabase/supabase-js";
import { type EntryType } from "./src/services/data";
import ChatHeader from "./src/components/ChatHeader";
import MessageBubble from "./src/components/MessageBubble";
import TypingIndicator from "./src/components/TypingIndicator";
import MessageInput from "./src/components/MessageInput";
import MenuModal from "./src/components/MenuModal";
import Auth from "./src/components/Auth";
import { useChatState } from "./src/hooks/useChatState";
import { useMenuState } from "./src/hooks/useMenuState";
import type { MessageGroup } from "./src/types/chat";
import { getColors, spacing, radii, typography, shadows } from "./src/theme";
import { useTheme } from "./src/contexts/ThemeContext";
import { supabase } from "./src/lib/supabase";
import purgeLocal from "./src/utils/purgeLocal";
import Constants from "expo-constants";
import { ThemeProvider } from "./src/contexts/ThemeContext";

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
}

const ChatScreen: React.FC<ChatScreenProps> = ({ session }) => {
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
  } = useChatState(menuState.refreshAllEntryCounts);

  const [type, setType] = useState<EntryType>("journal");
  const [content, setContent] = useState("");
  const [showMenu, setShowMenu] = useState(false);
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

  // Gesture handling for swipe to open menu
  const mainContentTranslateX = useRef(new Animated.Value(0)).current;
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [gestureProgress, setGestureProgress] = useState(0);

  // Reset main content position when menu closes
  const handleMenuClose = useCallback(() => {
    setShowMenu(false);
    // Reset main content to original position
    Animated.spring(mainContentTranslateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 120,
      friction: 9,
    }).start();
  }, [mainContentTranslateX]);

  // Handle menu button press with same animation
  const handleMenuButtonPress = useCallback(() => {
    setShowMenu(true);
    // Animate main content out with same spring animation as gesture
    Animated.spring(mainContentTranslateX, {
      toValue: 300,
      useNativeDriver: true,
      tension: 120,
      friction: 9,
    }).start();
  }, [mainContentTranslateX]);

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
          onPress: clearMessages,
        },
      ]
    );
  }, [clearMessages]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([20, -5]) // Only activate on right swipes (positive X), ignore small left movements
    .failOffsetY([-30, 30]) // More restrictive Y threshold to avoid interfering with scroll
    .onStart(() => {
      setIsGestureActive(true);
      setShowMenu(true);
    })
    .onUpdate((event) => {
      // Only allow rightward movement (positive translationX)
      const clampedTranslation = Math.max(0, event.translationX);
      mainContentTranslateX.setValue(clampedTranslation);

      // Calculate gesture progress for menu sliding
      const progress = Math.min(clampedTranslation / 300, 1); // 0 to 1
      setGestureProgress(progress);
    })
    .onEnd((event) => {
      setIsGestureActive(false);
      setGestureProgress(0);

      // If swiped right with sufficient distance or velocity, open menu
      if (event.translationX > 50 || event.velocityX > 500) {
        setShowMenu(true);

        // Animate main content fully out
        Animated.spring(mainContentTranslateX, {
          toValue: 300,
          useNativeDriver: true,
          tension: 120,
          friction: 9,
        }).start();
      } else {
        // Reset position with spring animation
        Animated.spring(mainContentTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 9,
        }).start();
      }
    });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <GestureDetector gesture={panGesture}>
        <Animated.View
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
        </Animated.View>
      </GestureDetector>

      <MenuModal
        visible={showMenu}
        onClose={handleMenuClose}
        session={session}
        gestureProgress={isGestureActive ? gestureProgress : 1}
        menuState={menuState}
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
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <ChatScreen session={session} />
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

export default App;
