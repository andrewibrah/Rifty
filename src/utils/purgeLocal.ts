import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'

const FLAG_KEY = 'migrations:MIGRATION_2025_10_REMOVE_LOCAL_DB'

async function removeLegacyDatabases() {
  // Expo's new FileSystem typings expose directories via runtime constants only.
  const baseDir = (FileSystem as unknown as { documentDirectory?: string })
    .documentDirectory
  if (!baseDir) return

  const dbDir = `${baseDir}SQLite/`

  try {
    const entries = await FileSystem.readDirectoryAsync(dbDir)
    await Promise.all(
      entries
        .filter((name) => name.endsWith('.db'))
        .map((name) =>
          FileSystem.deleteAsync(dbDir + name, { idempotent: true }).catch(() =>
            undefined
          )
        )
    )
  } catch (error) {
    console.warn('Unable to inspect database directory', error)
  }
}

export default async function purgeLocal() {
  if (!__DEV__) return false

  const alreadyPurged = await AsyncStorage.getItem(FLAG_KEY)
  if (alreadyPurged) {
    return false
  }

  await AsyncStorage.clear()
  await removeLegacyDatabases()
  await AsyncStorage.setItem(FLAG_KEY, new Date().toISOString())
  return true
}
