import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';
import { initDB, type EntryType } from './src/db';
import ChatHeader from './src/components/ChatHeader';
import MessageBubble from './src/components/MessageBubble';
import TypingIndicator from './src/components/TypingIndicator';
import MessageInput from './src/components/MessageInput';
import HistoryModal from './src/components/HistoryModal';
import { useChatState } from './src/hooks/useChatState';
import type { MessageGroup } from './src/types/chat';
import { colors, spacing, radii } from './src/theme';

const SPLASH_DURATION = 2500;

const App = () => {
  const listRef = useRef<FlatList<MessageGroup>>(null);
  const {
    messages,
    isTyping,
    groupMessages,
    sendMessage,
    retryMessage
  } = useChatState();

  const [type, setType] = useState<EntryType>('journal');
  const [content, setContent] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const flameTranslate = useRef(new Animated.Value(0)).current;
  const flameScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    initDB();

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
    setContent('');

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  };

  const handleRetry = (messageId: string) => {
    retryMessage(messageId);
  };

  const messageGroups = groupMessages(messages);

  const renderItem = ({ item: group }: { item: MessageGroup; index: number }) => (
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
      <StatusBar barStyle="light-content" backgroundColor={colors.carbonBlack} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <View style={styles.backgroundGlow} />
          <ChatHeader onHistoryPress={() => setShowHistory(true)} />

          <FlatList
            ref={listRef}
            data={messageGroups}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            style={styles.messageList}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews
            onContentSizeChange={() => {
              requestAnimationFrame(() => {
                listRef.current?.scrollToEnd({ animated: false });
              });
            }}
          />

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
        <Animated.View style={[styles.splashContainer, { opacity: splashOpacity }]}>
          <View style={styles.splashContent}>
            <View style={styles.splashGlow} />
            <Text style={styles.splashR}>R</Text>
            <Animated.View
              style={[
                styles.splashFlame,
                {
                  transform: [
                    { translateY: flameTranslate },
                    { scale: flameScale },
                  ],
                },
              ]}
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
    backgroundColor: colors.carbonBlack,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.carbonBlack,
  },
  flex: {
    flex: 1,
    position: 'relative',
  },
  backgroundGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: colors.primaryRed,
    opacity: 0.15,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
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
    backgroundColor: colors.carbonBlack,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.primaryRed,
    opacity: 0.2,
    shadowColor: colors.emberOrange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
  },
  splashR: {
    fontSize: 144,
    color: colors.primaryRed,
    fontWeight: '800',
    letterSpacing: 4,
  },
  splashFlame: {
    position: 'absolute',
    top: -60,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primaryRed,
    shadowColor: colors.emberOrange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
    opacity: 0.7,
  },
});

export default App;
