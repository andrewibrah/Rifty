import type {
  LanguageIntensity,
  PersonalizationState,
  PersonaTag,
  ReflectionCadence,
} from '../types/personalization'

const isHigh = (value: number) => value >= 7

const hasGoals = (goals: string[], targets: string[]) =>
  goals.some((goal) => targets.includes(goal))

const cadenceIs = (cadence: ReflectionCadence, target: ReflectionCadence) =>
  cadence === target

const intensityMatches = (intensity: LanguageIntensity, targets: LanguageIntensity[]) =>
  targets.includes(intensity)

const hasDriftAnchor = (state: PersonalizationState) =>
  state.drift_rule.enabled && Boolean(state.drift_rule.after)

const hasCrisisNote = (state: PersonalizationState) => Boolean(state.crisis_card?.trim())

const isLowerBluntness = (value: number) => value <= 4

export const computePersonaTag = (state: PersonalizationState): PersonaTag => {
  const visualScore = state.learning_style.visual
  const kinestheticScore = state.learning_style.kinesthetic
  const auditoryScore = state.learning_style.auditory
  const bluntness = state.bluntness
  const cadence = state.cadence
  const intensity = state.language_intensity
  const goals = state.goals
  const sessionLength = state.session_length_minutes

  if (
    isHigh(visualScore) &&
    isHigh(kinestheticScore) &&
    intensityMatches(intensity, ['direct']) &&
    cadenceIs(cadence, 'daily')
  ) {
    return 'Architect'
  }

  if (
    isHigh(auditoryScore) &&
    intensityMatches(intensity, ['soft', 'neutral']) &&
    cadenceIs(cadence, 'weekly')
  ) {
    return 'Explorer'
  }

  if (hasDriftAnchor(state) && hasCrisisNote(state) && isLowerBluntness(bluntness)) {
    return 'Anchor'
  }

  if (
    bluntness >= 8 &&
    sessionLength >= 10 &&
    sessionLength <= 25 &&
    hasGoals(goals, ['execution', 'performance'])
  ) {
    return 'Accelerator'
  }

  return 'Generalist'
}
