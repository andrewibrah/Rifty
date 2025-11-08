-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_goal_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid,
  utterance text NOT NULL,
  response_summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_goal_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_goal_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT ai_goal_sessions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.atomic_moments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_id uuid,
  message_id uuid,
  session_id uuid,
  content text NOT NULL,
  tags ARRAY DEFAULT ARRAY[]::text[],
  importance_score integer DEFAULT 5 CHECK (importance_score >= 1 AND importance_score <= 10),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT atomic_moments_pkey PRIMARY KEY (id),
  CONSTRAINT atomic_moments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT atomic_moments_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id),
  CONSTRAINT atomic_moments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id)
);
CREATE TABLE public.chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_date date NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  title text,
  summary text,
  message_count integer NOT NULL DEFAULT 0,
  ai_title_confidence double precision,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.check_ins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['daily_morning'::text, 'daily_evening'::text, 'weekly'::text])),
  prompt text NOT NULL,
  response text,
  response_entry_id uuid,
  scheduled_for timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT check_ins_pkey PRIMARY KEY (id),
  CONSTRAINT check_ins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT check_ins_response_entry_id_fkey FOREIGN KEY (response_entry_id) REFERENCES public.entries(id)
);
CREATE TABLE public.entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type USER-DEFINED NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ai_intent text,
  ai_confidence double precision CHECK (ai_confidence IS NULL OR ai_confidence >= 0::double precision AND ai_confidence <= 1::double precision),
  ai_meta jsonb,
  source text NOT NULL DEFAULT 'user'::text CHECK (source = ANY (ARRAY['user'::text, 'system'::text, 'ai'::text])),
  mood text,
  feeling_tags ARRAY DEFAULT ARRAY[]::text[],
  linked_moments ARRAY DEFAULT ARRAY[]::uuid[],
  embedding USER-DEFINED,
  CONSTRAINT entries_pkey PRIMARY KEY (id),
  CONSTRAINT entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.entry_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  embedding USER-DEFINED,
  model text NOT NULL DEFAULT 'text-embedding-3-small'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT entry_embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT entry_embeddings_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id),
  CONSTRAINT entry_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.entry_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  summary text NOT NULL,
  emotion text,
  topics ARRAY DEFAULT ARRAY[]::text[],
  people ARRAY DEFAULT ARRAY[]::text[],
  urgency_level integer CHECK (urgency_level >= 0 AND urgency_level <= 10),
  suggested_action text,
  blockers text,
  dates_mentioned ARRAY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT entry_summaries_pkey PRIMARY KEY (id),
  CONSTRAINT entry_summaries_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id),
  CONSTRAINT entry_summaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.goal_anchors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  anchor_type text NOT NULL CHECK (anchor_type = ANY (ARRAY['check_in'::text, 'milestone'::text])),
  scheduled_for timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT goal_anchors_pkey PRIMARY KEY (id),
  CONSTRAINT goal_anchors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT goal_anchors_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.goal_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_goal_id uuid NOT NULL,
  target_goal_id uuid NOT NULL,
  relationship text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT goal_links_pkey PRIMARY KEY (id),
  CONSTRAINT goal_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT goal_links_source_goal_id_fkey FOREIGN KEY (source_goal_id) REFERENCES public.goals(id),
  CONSTRAINT goal_links_target_goal_id_fkey FOREIGN KEY (target_goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.goal_progress_cache (
  goal_id uuid NOT NULL,
  progress_pct numeric NOT NULL DEFAULT 0,
  coherence_score numeric NOT NULL DEFAULT 0,
  ghi_state text NOT NULL DEFAULT 'unknown'::text CHECK (ghi_state = ANY (ARRAY['alive'::text, 'dormant'::text, 'misaligned'::text, 'complete'::text, 'unknown'::text])),
  last_computed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT goal_progress_cache_pkey PRIMARY KEY (goal_id),
  CONSTRAINT goal_progress_cache_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.goal_reflections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  alignment_score numeric NOT NULL CHECK (alignment_score >= 0::numeric AND alignment_score <= 1::numeric),
  emotion jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT goal_reflections_pkey PRIMARY KEY (id),
  CONSTRAINT goal_reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT goal_reflections_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id),
  CONSTRAINT goal_reflections_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id)
);
CREATE TABLE public.goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  target_date date,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text, 'paused'::text])),
  current_step text,
  micro_steps jsonb DEFAULT '[]'::jsonb,
  source_entry_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  embedding USER-DEFINED,
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT goals_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.entries(id)
);
CREATE TABLE public.intent_audits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  prompt text NOT NULL,
  predicted_intent text NOT NULL,
  correct_intent text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT intent_audits_pkey PRIMARY KEY (id),
  CONSTRAINT intent_audits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT intent_audits_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['system'::text, 'user'::text, 'assistant'::text])),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.entries(id),
  CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])),
  due_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT milestones_pkey PRIMARY KEY (id),
  CONSTRAINT milestones_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT milestones_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.model_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL,
  accuracy numeric NOT NULL,
  top3_accuracy numeric NOT NULL,
  confusion jsonb NOT NULL,
  report_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT model_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT model_evaluations_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.model_registry(id)
);
CREATE TABLE public.model_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  version text NOT NULL,
  description text,
  artifact_path text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT model_registry_pkey PRIMARY KEY (id),
  CONSTRAINT model_registry_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.persona_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL CHECK (source = ANY (ARRAY['onboarding'::text, 'settings_update'::text])),
  rationale text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT persona_signals_pkey PRIMARY KEY (id),
  CONSTRAINT persona_signals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  username text,
  website text,
  timezone text DEFAULT 'UTC'::text,
  onboarding_completed boolean DEFAULT false,
  missed_day_count integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  last_message_at timestamp with time zone,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.riflett_ai_event (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  intent text NOT NULL,
  input text NOT NULL,
  output_json jsonb NOT NULL,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  model text,
  temperature numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT riflett_ai_event_pkey PRIMARY KEY (id),
  CONSTRAINT riflett_ai_event_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.riflett_context_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  input_text text NOT NULL,
  output_json jsonb NOT NULL,
  version text NOT NULL DEFAULT 'spine.v1'::text,
  diagnostics jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT riflett_context_snapshot_pkey PRIMARY KEY (id),
  CONSTRAINT riflett_context_snapshot_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.riflett_failure (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ai_event_id uuid,
  failure_type USER-DEFINED NOT NULL,
  signal text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT riflett_failure_pkey PRIMARY KEY (id),
  CONSTRAINT riflett_failure_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT riflett_failure_ai_event_id_fkey FOREIGN KEY (ai_event_id) REFERENCES public.riflett_ai_event(id)
);
CREATE TABLE public.riflett_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ai_event_id uuid NOT NULL,
  label USER-DEFINED NOT NULL,
  correction text,
  tags ARRAY NOT NULL DEFAULT ARRAY[]::text[],
  confidence_from_model numeric CHECK (confidence_from_model IS NULL OR confidence_from_model >= 0::numeric AND confidence_from_model <= 1::numeric),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT riflett_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT riflett_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT riflett_feedback_ai_event_id_fkey FOREIGN KEY (ai_event_id) REFERENCES public.riflett_ai_event(id)
);
CREATE TABLE public.riflett_lesson (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_text text NOT NULL,
  scope USER-DEFINED NOT NULL,
  source_failure_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT riflett_lesson_pkey PRIMARY KEY (id),
  CONSTRAINT riflett_lesson_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT riflett_lesson_source_failure_id_fkey FOREIGN KEY (source_failure_id) REFERENCES public.riflett_failure(id)
);
CREATE TABLE public.riflett_memory_edge (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  src_id uuid NOT NULL,
  dst_id uuid NOT NULL,
  relation text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5 CHECK (weight >= 0::numeric AND weight <= 1::numeric),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT riflett_memory_edge_pkey PRIMARY KEY (id),
  CONSTRAINT riflett_memory_edge_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT riflett_memory_edge_src_id_fkey FOREIGN KEY (src_id) REFERENCES public.riflett_memory_node(id),
  CONSTRAINT riflett_memory_edge_dst_id_fkey FOREIGN KEY (dst_id) REFERENCES public.riflett_memory_node(id)
);
CREATE TABLE public.riflett_memory_node (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_entry_id uuid,
  related_goal_id uuid,
  type USER-DEFINED NOT NULL,
  text text NOT NULL,
  text_hash text DEFAULT md5(text),
  embedding USER-DEFINED,
  trust_weight numeric NOT NULL DEFAULT 0.7 CHECK (trust_weight >= 0::numeric AND trust_weight <= 1::numeric),
  confirmed boolean NOT NULL DEFAULT false,
  sentiment numeric DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT riflett_memory_node_pkey PRIMARY KEY (id),
  CONSTRAINT riflett_memory_node_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT riflett_memory_node_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.entries(id),
  CONSTRAINT riflett_memory_node_related_goal_id_fkey FOREIGN KEY (related_goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.schedule_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid,
  intent text NOT NULL,
  summary text,
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone NOT NULL,
  location text,
  attendees ARRAY NOT NULL DEFAULT ARRAY[]::text[],
  receipts jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT schedule_blocks_pkey PRIMARY KEY (id),
  CONSTRAINT schedule_blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT schedule_blocks_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.user_facts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fact text NOT NULL,
  category text,
  confidence double precision DEFAULT 0.8 CHECK (confidence >= 0::double precision AND confidence <= 1::double precision),
  source_entry_ids ARRAY DEFAULT ARRAY[]::uuid[],
  last_confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_facts_pkey PRIMARY KEY (id),
  CONSTRAINT user_facts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_settings (
  user_id uuid NOT NULL,
  personalization_mode text NOT NULL DEFAULT 'full'::text CHECK (personalization_mode = ANY (ARRAY['basic'::text, 'full'::text])),
  local_cache_enabled boolean NOT NULL DEFAULT true,
  cadence text NOT NULL DEFAULT 'none'::text CHECK (cadence = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text])),
  goals ARRAY NOT NULL DEFAULT ARRAY[]::text[],
  extra_goal text,
  learning_style jsonb NOT NULL DEFAULT jsonb_build_object('visual', 5, 'auditory', 5, 'kinesthetic', 5),
  session_length_minutes integer NOT NULL DEFAULT 25,
  spiritual_prompts boolean NOT NULL DEFAULT false,
  bluntness integer NOT NULL DEFAULT 5,
  language_intensity text NOT NULL DEFAULT 'neutral'::text CHECK (language_intensity = ANY (ARRAY['soft'::text, 'neutral'::text, 'direct'::text])),
  logging_format text NOT NULL DEFAULT 'mixed'::text CHECK (logging_format = ANY (ARRAY['freeform'::text, 'structured'::text, 'mixed'::text])),
  drift_rule jsonb NOT NULL DEFAULT jsonb_build_object('enabled', false, 'after', NULL::unknown),
  crisis_card text,
  persona_tag text NOT NULL DEFAULT 'Generalist'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  custom_goals ARRAY NOT NULL DEFAULT ARRAY[]::text[],
  checkin_notifications boolean NOT NULL DEFAULT true,
  missed_day_notifications boolean NOT NULL DEFAULT true,
  CONSTRAINT user_settings_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
