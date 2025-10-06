-- Enable Row Level Security (RLS) for per-user isolation
-- Adjust table/column names if your schema differs.

-- Entries table (journal/goal/schedule)
alter table if exists public.entries enable row level security;

drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
for select using (user_id = auth.uid());

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
for insert with check (user_id = auth.uid());

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
for update using (user_id = auth.uid());

drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own" on public.entries
for delete using (user_id = auth.uid());

-- Messages table (per-entry conversation/annotations)
alter table if exists public.messages enable row level security;

drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages
for select using (user_id = auth.uid());

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
for insert with check (user_id = auth.uid());

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
for update using (user_id = auth.uid());

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
for delete using (user_id = auth.uid());
