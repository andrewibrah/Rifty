# Frontend Database Calls → Edge Functions Migration

## Overview

This document lists frontend database calls that should be converted to edge functions for security, performance, and business logic protection.

---

## High Priority: Complex Operations

### 1. Entry Creation with AI Processing (✅ converted)

**Location:** `src/lib/entries.ts`

- **`createEntryFromChat()`** → edge function `create_entry_from_chat`
  - Moves entry insert + summarization + embedding + atomic moment creation server-side
  - **Tables:** `entries`, `entry_summaries`, `entry_embeddings`, `atomic_moments`

---

### 2. Memory & RAG Operations (converted ✅)

**Location:** `src/services/memory.ts`

- **`getOperatingPicture()`** → edge function `get_operating_picture`
  - Multi-table aggregation now handled server-side
- **`ragSearch()`** → edge function `rag_search`
  - Vector similarity & detail lookups handled server-side
- **`answerAnalystQuery()`** → edge function `analyst_query`
  - RAG + OpenAI call now runs on the edge
- **`persistUserFacts()`** → edge function `persist_user_facts`
  - Handles validation & upsert server-side (`features` table)

---

### 3. Goals Management (✅ converted)

**Location:** `src/services/goals.unified.ts`

- **`listActiveGoalsWithContext()`** → edge function `goals_list_with_context`
- **`createGoal()`** → edge function `create_goal`
- **`updateGoalById()`** → edge function `update_goal`
- **`upsertProgressCache()`** → handled within goal edge functions

---

### 4. Embeddings (✅ converted)

**Location:** `src/services/embeddings.ts`

- **`generateEmbedding()`** → edge function `generate_embedding`
  - OpenAI embedding generation moved server-side
  - **Tables:** None

- **`storeEntryEmbedding()`** → edge function `store_entry_embedding`
  - Embedding persistence with ownership validation handled server-side
  - **Tables:** `entry_embeddings`

- **`embedEntry()`** → edge function `embed_entry`
  - Combined generate + store operation now runs on the edge
  - **Tables:** `entry_embeddings`

---

### 5. Summarization (✅ converted)

**Location:** `src/services/summarization.ts`

- **`summarizeEntry()`** → edge function `summarize_entry`
  - OpenAI summarization with optional storage moved server-side
  - **Tables:** `entry_summaries` (optional)

- **`storeEntrySummary()`** → edge function `store_entry_summary`
  - Summary persistence with ownership validation handled server-side
  - **Tables:** `entry_summaries`

- **`detectGoal()`** → edge function `detect_goal`
  - OpenAI goal detection now runs on the edge
  - **Tables:** None

---

### 6. Personalization (✅ converted)

**Location:** `src/services/personalization.ts`

- **`persistPersonalization()`** → edge function `persist_personalization`
  - Multi-table transaction (user_settings, profiles, persona_signals) handled server-side
  - **Tables:** `user_settings`, `profiles`, `persona_signals`

- **`fetchPersonalizationBundle()`** → edge function `fetch_personalization_bundle`
  - Multi-table aggregation optimized server-side with parallel queries
  - **Tables:** `profiles`, `user_settings`, `features`

---

## Medium Priority: Bulk Operations

### 7. Entry Deletion (✅ converted)

**Location:** `src/services/data.ts`

- **`deleteAllJournalEntries()`** → edge function `delete_all_entries`
  - Bulk deletion with count tracking and audit logging handled server-side
  - **Tables:** `entries`, `deletion_logs`

- **`deleteAllEntriesByType()`** → edge function `delete_entries_by_type`
  - Type-specific bulk deletion with validation and logging handled server-side
  - **Tables:** `entries`, `deletion_logs`

---

### 8. User Facts (✅ converted)

**Location:** `src/services/memory.ts`

- **`createUserFact()`** → edge function `create_user_fact`
  - Fact quality validation and confidence scoring handled server-side
  - **Tables:** `user_facts`

- **`updateUserFact()`** → edge function `update_user_fact`
  - Update validation with ownership verification handled server-side
  - **Tables:** `user_facts`

- **`deleteUserFact()`** → edge function `delete_user_fact`
  - Deletion with audit logging handled server-side
  - **Tables:** `user_facts`, `deletion_logs`

---

## Lower Priority: Simple Operations (Keep Client-Side)

These can stay client-side if RLS is properly configured:

- Simple SELECT queries (list, get by ID)
- Simple INSERT/UPDATE/DELETE for single records
- Read-only operations with proper RLS

**Examples:**

- `listJournals()` - Simple SELECT
- `getJournalEntryById()` - Simple SELECT
- `listGoals()` - Simple SELECT
- `getGoalById()` - Simple SELECT
- `listCheckIns()` - Simple SELECT
- `getProfile()` - Simple SELECT

---

## Summary

**Total Functions to Convert:** ~15-20

**Priority Breakdown:**

- **High Priority:** 10 functions (AI processing, complex queries)
- **Medium Priority:** 5 functions (bulk operations, validation)
- **Keep Client-Side:** Simple CRUD with RLS

**Key Patterns:**

1. Any operation calling OpenAI → Edge Function
2. Any operation generating embeddings → Edge Function
3. Multi-table queries/joins → Edge Function
4. Bulk delete operations → Edge Function
5. Business logic validation → Edge Function
