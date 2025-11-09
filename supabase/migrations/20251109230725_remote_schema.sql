drop extension if exists "pg_net";

create type "public"."entry_type" as enum ('journal', 'goal', 'schedule');

drop trigger if exists "events_prevent_delete" on "public"."events";

drop trigger if exists "events_prevent_update" on "public"."events";

alter table "public"."entries" drop constraint "entries_type_check";

alter table "public"."model_evaluations" drop constraint "model_evaluations_accuracy_check";

alter table "public"."model_evaluations" drop constraint "model_evaluations_top3_accuracy_check";

drop function if exists "public"."enforce_events_append_only"();

drop index if exists "public"."idx_entries_type";

drop index if exists "public"."idx_messages_conversation_id";

alter table "public"."entries" alter column "type" set data type public.entry_type using "type"::public.entry_type;

alter table "public"."messages" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."messages" alter column "conversation_id" set data type uuid using "conversation_id"::uuid;

alter table "public"."profiles" add column "avatar_url" text;

alter table "public"."profiles" add column "display_name" text;

alter table "public"."profiles" add column "email" text not null;

alter table "public"."profiles" add column "username" text;

alter table "public"."profiles" add column "website" text;

alter table "public"."profiles" alter column "created_at" set not null;

alter table "public"."profiles" alter column "updated_at" set not null;

CREATE INDEX entries_metadata_gin_idx ON public.entries USING gin (metadata);

CREATE INDEX entries_user_created_at_idx ON public.entries USING btree (user_id, created_at DESC);

CREATE INDEX entries_user_type_created_at_idx ON public.entries USING btree (user_id, type, created_at DESC);

CREATE INDEX messages_conversation_created_at_idx ON public.messages USING btree (conversation_id, created_at DESC);

CREATE INDEX messages_metadata_gin_idx ON public.messages USING gin (metadata);

CREATE INDEX messages_user_conversation_created_at_idx ON public.messages USING btree (user_id, conversation_id, created_at DESC);

CREATE INDEX profiles_updated_at_idx ON public.profiles USING btree (updated_at DESC);

CREATE INDEX idx_entries_type ON public.entries USING btree (type);

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);

alter table "public"."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.entries(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_conversation_id_fkey";


  create policy "insert self profile"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "profiles_delete_own"
  on "public"."profiles"
  as permissive
  for delete
  to authenticated
using ((id = ( SELECT auth.uid() AS uid)));



  create policy "read own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "update own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = id));


CREATE TRIGGER set_entries_updated_at BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


