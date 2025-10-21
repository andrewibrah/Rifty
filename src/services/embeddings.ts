import Constants from 'expo-constants'
import { supabase } from '../lib/supabase'
import type {
  EntryEmbedding,
  CreateEntryEmbeddingParams,
  SimilarEntry,
} from '../types/mvp'
import { isUUID } from '../utils/uuid'

const getOpenAIKey = (): string => {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>
  const apiKey =
    extra?.openaiApiKey ||
    extra?.EXPO_PUBLIC_OPENAI_API_KEY ||
    extra?.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OpenAI API key is missing')
  }
  return apiKey
}

const EMBEDDING_MODEL = 'text-embedding-3-small'

/**
 * Generate an embedding for a given text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = getOpenAIKey()
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 30000)

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
      signal: ctrl.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.warn('[OpenAI Embeddings] Error:', response.status, errorBody)
      throw new Error('Failed to generate embedding')
    }

    const data = await response.json()
    const embedding = data?.data?.[0]?.embedding

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding response from OpenAI')
    }

    return embedding
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Embedding request timed out')
    }
    console.error('[OpenAI Embeddings] Error:', error)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Store an embedding for an entry
 */
export async function storeEntryEmbedding(
  params: CreateEntryEmbeddingParams
): Promise<EntryEmbedding> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  if (!isUUID(params.entry_id)) {
    throw new Error('Invalid entry id for embedding storage')
  }

  const { data, error } = await supabase
    .from('entry_embeddings')
    .insert({
      entry_id: params.entry_id,
      user_id: user.id,
      embedding: params.embedding,
      model: params.model ?? EMBEDDING_MODEL,
    })
    .select()
    .single()

  if (error) {
    console.error('[storeEntryEmbedding] Error:', error)
    throw error
  }

  return data as EntryEmbedding
}

/**
 * Generate and store embedding for an entry
 */
export async function embedEntry(
  entryId: string,
  content: string
): Promise<EntryEmbedding> {
  if (!isUUID(entryId)) {
    throw new Error('Invalid entry id for embedding generation')
  }
  const embedding = await generateEmbedding(content)
  return storeEntryEmbedding({ entry_id: entryId, embedding })
}

/**
 * Find similar entries using cosine similarity
 */
export async function findSimilarEntries(
  queryText: string,
  options: {
    threshold?: number
    limit?: number
  } = {}
): Promise<SimilarEntry[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const threshold = options.threshold ?? 0.7
  const limit = options.limit ?? 5

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(queryText)

  // Use the match function from the database
  const { data, error } = await supabase.rpc('match_entry_embeddings', {
    query_embedding: queryEmbedding,
    match_user_id: user.id,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('[findSimilarEntries] Error:', error)
    throw error
  }

  return (data ?? []) as SimilarEntry[]
}

/**
 * Get entry embedding by entry ID
 */
export async function getEntryEmbedding(
  entryId: string
): Promise<EntryEmbedding | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  if (!isUUID(entryId)) {
    console.warn('[getEntryEmbedding] Skipping lookup for invalid entry id', entryId)
    return null
  }

  const { data, error } = await supabase
    .from('entry_embeddings')
    .select('*')
    .eq('entry_id', entryId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[getEntryEmbedding] Error:', error)
    throw error
  }

  return data as EntryEmbedding | null
}

/**
 * Delete entry embedding
 */
export async function deleteEntryEmbedding(entryId: string): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  if (!isUUID(entryId)) {
    console.warn('[deleteEntryEmbedding] Skipping delete for invalid entry id', entryId)
    return
  }

  const { error } = await supabase
    .from('entry_embeddings')
    .delete()
    .eq('entry_id', entryId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[deleteEntryEmbedding] Error:', error)
    throw error
  }
}
