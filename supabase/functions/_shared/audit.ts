import { supabaseAdminClient } from "./client.ts";

interface AuditEventParams {
  userId: string;
  type: string;
  subjectType: string;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
}

export async function logAuditEvent({
  userId,
  type,
  subjectType,
  subjectId = null,
  payload = {},
}: AuditEventParams): Promise<void> {
  try {
    await supabaseAdminClient.from("events").insert({
      user_id: userId,
      type,
      subject_type: subjectType,
      subject_id: subjectId ?? null,
      payload,
    });
  } catch (error) {
    console.warn(`[audit] Failed to log ${type} event`, error);
  }
}
