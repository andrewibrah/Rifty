import { supabase } from '@/lib/supabase';

export interface ModelRegistryRow {
  id: string;
  model_name: string;
  version: string;
  description: string | null;
  artifact_path: string | null;
  created_by: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ModelEvaluationRow {
  id: string;
  model_id: string;
  accuracy: number;
  top3_accuracy: number;
  confusion: Record<string, Record<string, number>>;
  report_path: string | null;
  created_at: string;
}

export async function registerModelVersion(payload: {
  modelName: string;
  version: string;
  description?: string;
  artifactPath?: string;
  metadata?: Record<string, unknown>;
}): Promise<ModelRegistryRow> {
  const { data, error } = await supabase
    .from('model_registry')
    .insert({
      model_name: payload.modelName,
      version: payload.version,
      description: payload.description ?? null,
      artifact_path: payload.artifactPath ?? null,
      metadata: payload.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as ModelRegistryRow;
}

export async function recordModelEvaluation(payload: {
  modelId: string;
  accuracy: number;
  top3Accuracy: number;
  confusion: Record<string, Record<string, number>>;
  reportPath?: string;
}): Promise<ModelEvaluationRow> {
  const { data, error } = await supabase
    .from('model_evaluations')
    .insert({
      model_id: payload.modelId,
      accuracy: payload.accuracy,
      top3_accuracy: payload.top3Accuracy,
      confusion: payload.confusion,
      report_path: payload.reportPath ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as ModelEvaluationRow;
}

export async function fetchLatestModel(modelName: string): Promise<ModelRegistryRow | null> {
  const { data, error } = await supabase
    .from('model_registry')
    .select('*')
    .eq('model_name', modelName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ModelRegistryRow | null) ?? null;
}

export async function listModelEvaluations(modelId: string): Promise<ModelEvaluationRow[]> {
  const { data, error } = await supabase
    .from('model_evaluations')
    .select('*')
    .eq('model_id', modelId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as ModelEvaluationRow[];
}
