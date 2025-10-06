import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set to run health check')
}

const supabase = createClient(url, anonKey)

async function main() {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error) throw error
    if (user) {
      console.log(`[health] auth.getUser(): ok for user ${user.id}`)
    } else {
      console.log('[health] auth.getUser(): no active session')
    }
  } catch (error) {
    console.error('[health] auth.getUser() failed', error)
    process.exitCode = 1
    return
  }

  try {
    const { error } = await supabase.from('profiles').select('*').limit(1)
    if (error) throw error
    console.log('[health] profiles query succeeded')
  } catch (error) {
    console.error('[health] profiles query failed', error)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('[health] unexpected error', error)
  process.exitCode = 1
})
