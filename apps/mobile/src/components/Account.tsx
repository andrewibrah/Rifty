import { useState, useEffect } from 'react'
import { StyleSheet, View, Alert, Text, TextInput, Pressable } from 'react-native'
import type { TextInputProps } from 'react-native'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface FieldProps {
  label: string
  value: string
  onChangeText?: (value: string) => void
  editable?: boolean
  keyboardType?: TextInputProps['keyboardType']
}

const Field = ({
  label,
  value,
  onChangeText,
  editable = true,
  keyboardType,
}: FieldProps) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, !editable && styles.inputDisabled]}
      value={value}
      editable={editable}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      autoCapitalize="none"
      autoCorrect={false}
      accessibilityLabel={label}
    />
  </View>
)

interface ActionButtonProps {
  title: string
  onPress: () => void | Promise<void>
  disabled?: boolean
  tone?: 'primary' | 'danger' | 'neutral'
}

const ActionButton = ({ title, onPress, disabled = false, tone = 'primary' }: ActionButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    onPress={disabled ? undefined : onPress}
    style={({ pressed }) => [
      styles.button,
      tone === 'danger' && styles.buttonDanger,
      tone === 'neutral' && styles.buttonNeutral,
      disabled && styles.buttonDisabled,
      pressed && !disabled && styles.buttonPressed,
    ]}
  >
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>
)

export default function Account({ session }: { session: Session }) {
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [website, setWebsite] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  useEffect(() => {
    if (session) getProfile()
  }, [session])

  async function getProfile() {
    try {
      setLoading(true)
      if (!session?.user) throw new Error('No user on the session!')

      const { data, error, status } = await supabase
        .from('profiles')
        .select(`username, website, avatar_url`)
        .eq('id', session?.user.id)
        .single()
      if (error && status !== 406) {
        throw error
      }

      if (data) {
        setUsername(data.username)
        setWebsite(data.website)
        setAvatarUrl(data.avatar_url)
      }
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert(error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function updateProfile({
    username,
    website,
    avatar_url,
  }: {
    username: string
    website: string
    avatar_url: string
  }) {
    try {
      setLoading(true)
      if (!session?.user) throw new Error('No user on the session!')

      const updates = {
        id: session?.user.id,
        username,
        website,
        avatar_url,
        updated_at: new Date(),
      }

      const { error } = await supabase.from('profiles').upsert(updates)

      if (error) {
        throw error
      }
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert(error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Field
        label="Email"
        value={session?.user?.email ?? ''}
        editable={false}
        keyboardType="email-address"
      />
      <Field label="Username" value={username} onChangeText={setUsername} />
      <Field label="Website" value={website} onChangeText={setWebsite} />

      <View style={styles.actions}>
        <ActionButton
          title={loading ? 'Updating…' : 'Update'}
          onPress={() => updateProfile({ username, website, avatar_url: avatarUrl })}
          disabled={loading}
        />
        <ActionButton
          title="Sign Out"
          onPress={async () => {
            try {
              const { error } = await supabase.auth.signOut()
              if (error) {
                console.error('Failed to sign out:', error.message)
                Alert.alert('Sign Out Error', error.message)
              }
            } catch (error) {
              console.error('Failed to sign out:', error)
              if (error instanceof Error) {
                Alert.alert('Sign Out Error', error.message)
              }
            }
          }}
          tone="danger"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
    padding: 16,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#111827',
  },
  inputDisabled: {
    backgroundColor: '#1F2937',
    color: '#9CA3AF',
  },
  actions: {
    gap: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#6366F1',
  },
  buttonDanger: {
    backgroundColor: '#EF4444',
  },
  buttonNeutral: {
    backgroundColor: '#4B5563',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
