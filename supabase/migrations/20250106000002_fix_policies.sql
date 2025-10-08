-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "entries_select_own" ON public.entries;
DROP POLICY IF EXISTS "entries_insert_own" ON public.entries;
DROP POLICY IF EXISTS "entries_update_own" ON public.entries;
DROP POLICY IF EXISTS "entries_delete_own" ON public.entries;

DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;

-- Create policies for entries table
CREATE POLICY "entries_select_own" ON public.entries
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "entries_insert_own" ON public.entries
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "entries_update_own" ON public.entries
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "entries_delete_own" ON public.entries
FOR DELETE USING (user_id = auth.uid());

-- Create policies for messages table
CREATE POLICY "messages_select_own" ON public.messages
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "messages_insert_own" ON public.messages
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_update_own" ON public.messages
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "messages_delete_own" ON public.messages
FOR DELETE USING (user_id = auth.uid());
