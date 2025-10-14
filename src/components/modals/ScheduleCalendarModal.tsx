import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";
import { listJournals, type RemoteJournalEntry } from "../../services/data";
import MenuEntryChat from "../menu/MenuEntryChat";
import { useEntryChat } from "../../hooks/useEntryChat";

interface ScheduleCalendarModalProps {
  visible: boolean;
  onClose: () => void;
}

type CalendarViewMode = "week" | "month";

type EntryGroups = Record<string, RemoteJournalEntry[]>;

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const formatDateKey = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatReadableDate = (value: Date) => {
  return value.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const startOfWeek = (value: Date) => {
  const date = new Date(value);
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday as the first day of the week
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
};

const addDays = (value: Date, amount: number) => {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
};

const addMonths = (value: Date, amount: number) => {
  const date = new Date(value.getFullYear(), value.getMonth() + amount, 1);
  return date;
};

const formatMonthTitle = (value: Date) =>
  value.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

const buildWeek = (value: Date) => {
  const start = startOfWeek(value);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
};

const buildMonth = (value: Date) => {
  const firstOfMonth = new Date(value.getFullYear(), value.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};

const parseScheduleContent = (content: string) => {
  const [place = "", time = "", reason = ""] = content
    .split("|")
    .map((part) => part.trim());

  return { place, time, reason };
};

const parseDateFromString = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    const date = new Date(`${isoMatch[0]}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
};

const resolveEntryDate = (entry: RemoteJournalEntry): Date => {
  if (entry.type === "schedule") {
    const metadata = (entry.metadata ?? {}) as Record<string, any>;
    const metadataDate = parseDateFromString(metadata?.scheduled_for);
    if (metadataDate) {
      return metadataDate;
    }

    const { time } = parseScheduleContent(entry.content ?? "");
    const parsed = parseDateFromString(time);
    if (parsed) {
      return parsed;
    }
  }

  return new Date(entry.created_at ?? Date.now());
};

const groupEntriesByDate = (entries: RemoteJournalEntry[]) => {
  return entries.reduce<EntryGroups>((acc, entry) => {
    const key = formatDateKey(resolveEntryDate(entry));
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(entry);
    return acc;
  }, {});
};

const ScheduleCalendarModal: React.FC<ScheduleCalendarModalProps> = ({
  visible,
  onClose,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [currentCursor, setCurrentCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [entries, setEntries] = useState<RemoteJournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
    null
  );

  const scheduleEntries = useMemo(
    () => entries.filter((entry) => entry.type === "schedule"),
    [entries]
  );

  const scheduleByDate = useMemo(
    () => groupEntriesByDate(scheduleEntries),
    [scheduleEntries]
  );

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listJournals({ limit: 500 });
      setEntries(items);
    } catch (err) {
      console.error("Failed to load calendar entries", err);
      setError("Unable to load schedule data right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setViewMode("week");
      const today = new Date();
      setCurrentCursor(today);
      setSelectedDate(today);
      fetchEntries();
    }
  }, [visible, fetchEntries]);

  useEffect(() => {
    if (!visible) return;
    setCurrentCursor(selectedDate);
  }, [selectedDate, visible]);

  useEffect(() => {
    if (!visible) return;
    const key = formatDateKey(selectedDate);
    const entriesForDay = scheduleByDate[key] ?? [];
    if (entriesForDay.length === 0) {
      if (selectedScheduleId !== null) {
        setSelectedScheduleId(null);
      }
      return;
    }

    if (!entriesForDay.some((entry) => entry.id === selectedScheduleId)) {
      setSelectedScheduleId(entriesForDay[0]?.id ?? null);
    }
  }, [visible, selectedDate, scheduleByDate, selectedScheduleId]);

  const handleSelectDate = useCallback(
    (day: Date) => {
      setSelectedDate(day);
      const key = formatDateKey(day);
      const entriesForDay = scheduleByDate[key] ?? [];
      setSelectedScheduleId(entriesForDay[0]?.id ?? null);
    },
    [scheduleByDate]
  );

  const handleChangeWeek = useCallback((direction: -1 | 1) => {
    setCurrentCursor((prev) => addDays(prev, direction * 7));
  }, []);

  const handleChangeMonth = useCallback((direction: -1 | 1) => {
    setCurrentCursor((prev) => addMonths(prev, direction));
  }, []);

  const selectedDateKey = formatDateKey(selectedDate);
  const itinerary = scheduleByDate[selectedDateKey] ?? [];

  const {
    selectedEntry: scheduleEntry,
    annotations: scheduleAnnotations,
    annotationsLoading,
    annotationsError,
    setAnnotations: setScheduleAnnotations,
    onErrorUpdate: setScheduleChatError,
    refreshAnnotations: refreshScheduleAnnotations,
  } = useEntryChat(selectedScheduleId, visible);

  const renderDayCell = (day: Date, isCurrentMonth = true) => {
    const dayKey = formatDateKey(day);
    const hasSchedules = Boolean(scheduleByDate[dayKey]?.length);
    const isSelected = dayKey === selectedDateKey;

    return (
      <TouchableOpacity
        key={dayKey}
        style={[
          styles.dayCell,
          !isCurrentMonth && styles.dayCellMuted,
          isSelected && styles.dayCellSelected,
        ]}
        onPress={() => handleSelectDate(day)}
      >
        <Text
          style={[
            styles.dayCellText,
            !isCurrentMonth && styles.dayCellTextMuted,
            isSelected && styles.dayCellTextSelected,
          ]}
        >
          {day.getDate()}
        </Text>
        {hasSchedules && <View style={styles.dayDot} />}
      </TouchableOpacity>
    );
  };

  const weekDays = useMemo(() => buildWeek(currentCursor), [currentCursor]);
  const monthDays = useMemo(() => buildMonth(currentCursor), [currentCursor]);
  const weekRangeLabel = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    if (start && end) {
      return `${formatMonthTitle(start)} — ${formatMonthTitle(end)}`;
    }
    return formatMonthTitle(currentCursor);
  }, [weekDays, currentCursor]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Schedule Overview</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.viewToggleRow}>
            <View style={styles.viewSelector}>
              <TouchableOpacity
                style={[
                  styles.viewToggleButton,
                  viewMode === "week" && styles.viewToggleActive,
                ]}
                onPress={() => setViewMode("week")}
              >
                <Text
                  style={[
                    styles.viewToggleText,
                    viewMode === "week" && styles.viewToggleTextActive,
                  ]}
                >
                  Week
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.viewToggleButton,
                  viewMode === "month" && styles.viewToggleActive,
                ]}
                onPress={() => setViewMode("month")}
              >
                <Text
                  style={[
                    styles.viewToggleText,
                    viewMode === "month" && styles.viewToggleTextActive,
                  ]}
                >
                  Month
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={fetchEntries}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Refresh schedule data"
            >
              <Ionicons name="refresh" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() =>
                  viewMode === "week"
                    ? handleChangeWeek(-1)
                    : handleChangeMonth(-1)
                }
                style={styles.arrowButton}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              <Text style={styles.calendarHeaderTitle}>
                {viewMode === "week"
                  ? weekRangeLabel
                  : formatMonthTitle(currentCursor)}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  viewMode === "week"
                    ? handleChangeWeek(1)
                    : handleChangeMonth(1)
                }
                style={styles.arrowButton}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {DAY_LABELS.map((label) => (
                <Text key={label} style={styles.weekdayLabel}>
                  {label}
                </Text>
              ))}
            </View>

            {viewMode === "week" ? (
              <View style={styles.weekRow}>
                {weekDays.map((day) => renderDayCell(day))}
              </View>
            ) : (
              <View style={styles.monthGrid}>
                {monthDays.map((day) =>
                  renderDayCell(
                    day,
                    day.getMonth() === currentCursor.getMonth()
                  )
                )}
              </View>
            )}
          </View>

          <ScrollView style={styles.detailsContainer}>
            <Text style={styles.detailsHeading}>
              {formatReadableDate(selectedDate)}
            </Text>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : error ? (
              <View style={styles.errorState}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={colors.error}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Itinerary</Text>
                {itinerary.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No schedules yet for this day. Use + Schedule to add one.
                  </Text>
                ) : (
                  itinerary.map((entry) => {
                    const { place, time, reason } = parseScheduleContent(
                      entry.content
                    );
                    const isActive = entry.id === selectedScheduleId;
                    return (
                      <TouchableOpacity
                        key={entry.id}
                        style={[
                          styles.scheduleCard,
                          isActive && styles.scheduleCardActive,
                        ]}
                        onPress={() => setSelectedScheduleId(entry.id)}
                      >
                        <View style={styles.scheduleRow}>
                          <Ionicons
                            name="location-outline"
                            size={16}
                            color={colors.accent}
                          />
                          <Text style={styles.scheduleValue}>
                            {place || "Tap to set place in chat"}
                          </Text>
                        </View>
                        <View style={styles.scheduleRow}>
                          <Ionicons
                            name="time-outline"
                            size={16}
                            color={colors.textSecondary}
                          />
                          <Text style={styles.scheduleValue}>
                            {time || "Add a time"}
                          </Text>
                        </View>
                        <View style={styles.scheduleRow}>
                          <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={16}
                            color={colors.textSecondary}
                          />
                          <Text style={styles.scheduleValue}>
                            {reason || "Note a reason or intention"}
                          </Text>
                        </View>
                        {entry.ai_meta?.rationale && (
                          <View style={styles.metaBox}>
                            <Text style={styles.metaLabel}>AI Insight</Text>
                            <Text style={styles.metaValue}>
                              {String(entry.ai_meta.rationale)}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.entryChatContainer}>
            {selectedScheduleId && scheduleEntry ? (
              <MenuEntryChat
                entry={scheduleEntry}
                annotations={scheduleAnnotations}
                loading={annotationsLoading}
                error={annotationsError}
                onAnnotationsUpdate={setScheduleAnnotations}
                onAnnotationCountUpdate={() => undefined}
                onErrorUpdate={setScheduleChatError}
                onRefreshAnnotations={refreshScheduleAnnotations}
              />
            ) : (
              <View style={styles.emptyChatContainer}>
                <Text style={styles.emptyText}>
                  Select a schedule to open notes and AI coaching.
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalContainer: {
      width: "94%",
      maxWidth: 520,
      maxHeight: "92%",
      backgroundColor: colors.background,
      borderRadius: radii.lg,
      padding: spacing.lg,
      ...shadows.glassElevated,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    headerTitle: {
      fontFamily: typography.heading.fontFamily,
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "700" as const,
    },
    closeButton: {
      padding: spacing.sm,
    },
    viewToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    viewSelector: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 2,
    },
    viewToggleButton: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
    },
    viewToggleActive: {
      backgroundColor: colors.accent,
    },
    viewToggleText: {
      fontFamily: typography.button.fontFamily,
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: "600" as const,
    },
    viewToggleTextActive: {
      color: "#FFFFFF",
    },
    refreshButton: {
      padding: spacing.sm,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    calendarContainer: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      backgroundColor: colors.surface,
    },
    calendarHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    calendarHeaderTitle: {
      fontFamily: typography.title.fontFamily,
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "600" as const,
    },
    arrowButton: {
      padding: spacing.xs,
      borderRadius: radii.pill,
    },
    weekdayRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    weekdayLabel: {
      flex: 1,
      textAlign: "center",
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    weekRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    dayCell: {
      width: "14.28%",
      aspectRatio: 1,
      borderRadius: radii.sm,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.xs,
      padding: spacing.xs,
    },
    dayCellMuted: {
      opacity: 0.35,
    },
    dayCellSelected: {
      backgroundColor: colors.accent,
    },
    dayCellText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textPrimary,
    },
    dayCellTextMuted: {
      color: colors.textTertiary,
    },
    dayCellTextSelected: {
      color: "#FFFFFF",
    },
    dayDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
      marginTop: 4,
    },
    detailsContainer: {
      marginTop: spacing.lg,
    },
    detailsHeading: {
      fontFamily: typography.title.fontFamily,
      fontSize: 18,
      color: colors.textPrimary,
      fontWeight: "600" as const,
      marginBottom: spacing.md,
    },
    loadingState: {
      paddingVertical: spacing.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    errorState: {
      paddingVertical: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    errorText: {
      marginLeft: spacing.xs,
      color: colors.error,
      fontFamily: typography.body.fontFamily,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontFamily: typography.title.fontFamily,
      fontSize: 16,
      color: colors.textSecondary,
      fontWeight: "600" as const,
      marginBottom: spacing.sm,
    },
    emptyText: {
      fontFamily: typography.body.fontFamily,
      color: colors.textTertiary,
      fontSize: 14,
    },
    scheduleCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    scheduleCardActive: {
      borderColor: colors.accent,
      shadowColor: colors.accent,
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    scheduleRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    scheduleValue: {
      marginLeft: spacing.sm,
      color: colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      flex: 1,
    },
    metaBox: {
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    metaLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    metaValue: {
      fontFamily: typography.body.fontFamily,
      color: colors.textPrimary,
      fontSize: 13,
    },
    entryChatContainer: {
      marginTop: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
      maxHeight: 520,
    },
    emptyChatContainer: {
      padding: spacing.md,
    },
  });

export default ScheduleCalendarModal;
