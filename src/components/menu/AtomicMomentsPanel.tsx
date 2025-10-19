import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { getColors, radii, spacing, typography } from '../../theme'
import {
  searchAtomicMoments,
  type AtomicMomentRecord,
} from '../../services/atomicMoments'

interface AtomicMomentsPanelProps {
  onClose: () => void
}

const DEFAULT_LIMIT = 60

const AtomicMomentsPanel: React.FC<AtomicMomentsPanelProps> = ({ onClose }) => {
  const { themeMode } = useTheme()
  const colors = getColors(themeMode)
  const styles = useMemo(() => createStyles(colors), [colors])

  const [query, setQuery] = useState('')
  const [moments, setMoments] = useState<AtomicMomentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (searchTerm?: string) => {
      setLoading(true)
      setError(null)
      try {
        const results = await searchAtomicMoments({
          query: searchTerm,
          limit: DEFAULT_LIMIT,
        })
        setMoments(results)
      } catch (err) {
        console.error('[AtomicMomentsPanel] fetch failed', err)
        setError('Unable to load atomic moments.')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const timeout = setTimeout(() => {
      load(query.trim() || undefined)
    }, 350)
    return () => clearTimeout(timeout)
  }, [query, load])

  const renderItem = ({ item }: { item: AtomicMomentRecord }) => (
    <View style={styles.momentCard}>
      <View style={styles.momentHeader}>
        <Ionicons name="sparkles" size={16} color={colors.accent} />
        <Text style={styles.momentScore}>{`Importance ${item.importance_score}/10`}</Text>
        <Text style={styles.momentDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.momentContent}>{item.content}</Text>
      {item.tags?.length ? (
        <View style={styles.tagRow}>
          {item.tags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Atomic Moments</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search saved insights"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : moments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="sparkles-outline" size={24} color={colors.textSecondary} />
          <Text style={styles.emptyLabel}>No atomic moments yet.</Text>
          <Text style={styles.emptyHint}>Capture important thoughts from chats and notes.</Text>
        </View>
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSpacer: {
      width: 44,
    },
    title: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      fontSize: 20,
      color: colors.textPrimary,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    searchInput: {
      flex: 1,
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      color: colors.textPrimary,
    },
    loader: {
      marginTop: spacing.xl,
    },
    errorText: {
      marginTop: spacing.lg,
      color: colors.error,
      textAlign: 'center',
    },
    emptyState: {
      alignItems: 'center',
      marginTop: spacing.xl,
      gap: spacing.sm,
    },
    emptyLabel: {
      fontFamily: typography.body.fontFamily,
      fontSize: 16,
      color: colors.textSecondary,
    },
    emptyHint: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textTertiary,
    },
    listContent: {
      paddingVertical: spacing.lg,
      gap: spacing.md,
    },
    momentCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    momentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    momentScore: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    momentDate: {
      marginLeft: 'auto',
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textTertiary,
    },
    momentContent: {
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    tagChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.xl,
      backgroundColor: colors.surfaceElevated,
    },
    tagText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      color: colors.textSecondary,
    },
  })

export default AtomicMomentsPanel
