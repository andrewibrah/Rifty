import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
  StyleSheet,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useMenuState } from "../hooks/useMenuState";
import { useEntryChat } from "../hooks/useEntryChat";
import MenuList from "./MenuList";
import MenuEntryChat from "./menu/MenuEntryChat";
import SettingsModal from "./SettingsModal";
import { getColors, spacing, typography, radii } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

interface MenuModalProps {
  visible: boolean;
  onClose: () => void;
  session: Session;
  gestureProgress?: number;
  menuState?: ReturnType<typeof useMenuState>;
  onSettingsPress?: () => void;
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  goal: "Goals",
  journal: "Journals",
  schedule: "Schedules",
};

const MenuModal: React.FC<MenuModalProps> = ({
  visible,
  onClose,
  session,
  gestureProgress = 1,
  menuState: passedMenuState,
  onSettingsPress,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [showSettings, setShowSettings] = useState(false);
  const [currentChatMode, setCurrentChatMode] = useState<"note" | "ai">("note");
  const [showContent, setShowContent] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  // Use passed menu state or create new one
  const menuState = passedMenuState || useMenuState();
  const entryChat = useEntryChat(menuState.selectedEntryId, visible);

  // Handle modal animation
  React.useEffect(() => {
    if (visible) {
      // Use gesture progress for smooth sliding
      const targetValue = -300 + gestureProgress * 300;
      slideAnim.setValue(targetValue);

      // Show content when menu is 70% slid in to prevent flickering
      // Or immediately if opened via button (gestureProgress = 1)
      if (gestureProgress >= 0.7 || gestureProgress === 1) {
        setShowContent(true);
      } else {
        setShowContent(false);
      }

      if (gestureProgress === 1) {
        // Only animate to final position when gesture is complete
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start();
      }
    } else {
      // Hide content and reset state when modal closes
      setShowContent(false);
      menuState.handleBack();
    }
  }, [visible, slideAnim, gestureProgress, menuState]);

  const handleAnnotationCountUpdate = useCallback(
    (entryId: string, delta: number) => {
      menuState.setAnnotationCounts((prev) => ({
        ...prev,
        [entryId]: (prev[entryId] || 0) + delta,
      }));
    },
    [menuState]
  );

  const handleModeChange = useCallback((mode: "note" | "ai") => {
    setCurrentChatMode(mode);
  }, []);

  const handleClearAIChat = useCallback(() => {
    if (!entryChat.selectedEntry) return;

    Alert.alert(
      "Clear AI Chat",
      "Are you sure you want to clear the AI conversation? This will permanently delete all AI messages from storage and cannot be undone.",
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
              // Delete all AI messages from Supabase
              const { error } = await supabase
                .from("messages")
                .delete()
                .eq("conversation_id", entryChat.selectedEntry!.id)
                .eq("metadata->>channel", "ai");

              if (error) {
                throw error;
              }

              // Refresh annotations from Supabase to get the updated state
              entryChat.refreshAnnotations();
            } catch (error) {
              console.error("Error clearing AI chat", error);
              entryChat.onErrorUpdate("Unable to clear AI chat right now.");
            }
          },
        },
      ]
    );
  }, [entryChat]);

  const showCategories = menuState.mode === "categories";
  const showEntries = menuState.mode === "entries";
  const showEntryChat = menuState.mode === "entryChat";

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        {showEntryChat ? (
          // Full screen entry chat
          <View style={styles.fullScreenContainer}>
            <SafeAreaView
              style={styles.fullScreenContent}
              edges={["top", "bottom", "left", "right"]}
            >
              <View style={styles.fullScreenHeader}>
                <TouchableOpacity
                  onPress={menuState.handleBack}
                  style={styles.backButton}
                >
                  <Ionicons
                    name="arrow-back"
                    size={20}
                    color={colors.textPrimary}
                  />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {entryChat.selectedEntry
                    ? currentChatMode === "note"
                      ? "Notes"
                      : "AI Chat"
                    : null}
                </Text>
                {entryChat.selectedEntry &&
                currentChatMode === "ai" &&
                entryChat.annotations.filter((a) => a.channel === "ai").length >
                  0 ? (
                  <TouchableOpacity
                    onPress={handleClearAIChat}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear AI chat"
                  >
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerSpacer} />
                )}
              </View>
              {entryChat.selectedEntry && (
                <MenuEntryChat
                  entry={entryChat.selectedEntry}
                  annotations={entryChat.annotations}
                  loading={entryChat.annotationsLoading}
                  error={entryChat.annotationsError}
                  onAnnotationsUpdate={entryChat.setAnnotations}
                  onAnnotationCountUpdate={handleAnnotationCountUpdate}
                  onErrorUpdate={entryChat.onErrorUpdate}
                  onModeChange={handleModeChange}
                  onRefreshAnnotations={entryChat.refreshAnnotations}
                  onClearAIChat={handleClearAIChat}
                />
              )}
            </SafeAreaView>
          </View>
        ) : (
          // Sidebar for categories and entries
          <Pressable
            style={styles.overlay}
            onPress={onClose}
            accessible={false}
          >
            <Animated.View
              style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}
            >
              <Pressable
                style={styles.sidebarPressable}
                onPress={(e) => e.stopPropagation()}
                accessible={false}
              >
                <SafeAreaView
                  style={styles.sidebarContent}
                  edges={["top", "bottom", "left", "right"]}
                >
                  <View style={styles.modalHeader}>
                    {!showCategories ? (
                      <TouchableOpacity
                        onPress={menuState.handleBack}
                        style={styles.backButton}
                      >
                        <Ionicons
                          name="arrow-back"
                          size={20}
                          color={colors.textPrimary}
                        />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.headerSpacer} />
                    )}
                    <Text style={styles.modalTitle}>
                      {showEntries && menuState.selectedType
                        ? `${ENTRY_TYPE_LABELS[menuState.selectedType]}`
                        : null}
                    </Text>
                    <View style={styles.headerSpacer} />
                  </View>

                  {showContent && (
                    <MenuList
                      mode={menuState.mode}
                      selectedType={menuState.selectedType}
                      entries={menuState.entries}
                      entriesLoading={menuState.entriesLoading}
                      entriesError={menuState.entriesError}
                      annotationCounts={menuState.annotationCounts}
                      entryCounts={menuState.entryCounts}
                      onSelectType={menuState.handleSelectType}
                      onSelectEntry={menuState.handleSelectEntry}
                      onEntriesUpdate={(entries) => {
                        // Update the entries in menu state
                        // Entry counts will update automatically via useEffect
                        (menuState as any).setEntries(entries);
                      }}
                    />
                  )}

                  {/* Footer with Settings Button */}
                  {showContent && showCategories && (
                    <View style={styles.footer}>
                      <TouchableOpacity
                        style={styles.footerSettingsButton}
                        onPress={() => {
                          if (onSettingsPress) {
                            onSettingsPress();
                          } else {
                            setShowSettings(true);
                          }
                        }}
                      >
                        <Ionicons
                          name="settings-outline"
                          size={20}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </SafeAreaView>
              </Pressable>
            </Animated.View>
          </Pressable>
        )}

        {!onSettingsPress && (
          <SettingsModal
            visible={showSettings}
            onClose={() => setShowSettings(false)}
            session={session}
          />
        )}
      </SafeAreaProvider>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      flexDirection: "row",
    },
    fullScreenContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    fullScreenContent: {
      flex: 1,
    },
    fullScreenHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      minHeight: 80,
    },
    sidebar: {
      width: 300,
      backgroundColor: colors.background,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 4, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 20,
    },
    sidebarPressable: {
      flex: 1,
    },
    sidebarContent: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      minHeight: 80,
    },
    modalTitle: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      fontSize: 20,
      color: colors.textPrimary,
      flex: 1,
      textAlign: "center",
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.surface,
      marginRight: spacing.xs,
    },
    headerSpacer: {
      width: 36,
    },
    clearButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 36,
      minHeight: 36,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
    },
    footerSettingsButton: {
      width: 44,
      height: 44,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 8,
      backgroundColor: "transparent",
    },
  });

export default MenuModal;
