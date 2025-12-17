-- Create entries table for journal entries, goals, and schedules
CREATE TABLE IF NOT EXISTS public.entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('journal', 'goal', 'schedule')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create messages table for conversation/annotations
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_entries_user_id ON public.entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON public.entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_type ON public.entries(type);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- Enable Row Level Security (RLS) for per-user isolation
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Entries table policies
DROP POLICY IF EXISTS "entries_select_own" ON public.entries;
CREATE POLICY "entries_select_own" ON public.entries
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "entries_insert_own" ON public.entries;
CREATE POLICY "entries_insert_own" ON public.entries
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "entries_update_own" ON public.entries;
CREATE POLICY "entries_update_own" ON public.entries
FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "entries_delete_own" ON public.entries;
CREATE POLICY "entries_delete_own" ON public.entries
FOR DELETE USING (user_id = auth.uid());

-- Messages table policies
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own" ON public.messages
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages
FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own" ON public.messages
FOR DELETE USING (user_id = auth.uid());
