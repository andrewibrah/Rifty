export type AnnotationChannel = 'note' | 'ai' | 'system'

export type AnnotationKind = 'user' | 'bot' | 'system'

export interface Annotation {
  id: string
  entryId: string
  kind: AnnotationKind
  channel: AnnotationChannel
  content: string
  created_at: string
  metadata?: Record<string, any> | null
}
